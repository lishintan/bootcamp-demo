/**
 * Sprint 5 Pipeline: Monthly Feature Digest — Orchestrator
 *
 * Delivers a formatted monthly feature insight digest to Squad Leads in Slack
 * and writes/updates a quarterly Confluence page in the Product Management space.
 *
 * Schedule: First Monday of each month at 8:00 AM (cron: 0 8 1-7 * 1)
 * HTTP trigger: POST /trigger/monthly-digest
 *
 * Flow:
 *   1. Fetch all Parking Lot tickets (enriched with custom fields)
 *   2. Filter for feature tickets (isFeatureTicket)
 *   3. Run grouping + impact scoring + delivery linking for feature groups
 *   4. Identify Won't Do candidates for feature groups
 *   5. Run resurfacing check (previously Won't Do'd tickets with ≥3 new similar)
 *   6. Build per-squad-lead digests (top-5 themes + Notable Trends + resurfacing)
 *   7. Synthesise top-5 themes via Claude (user story, pain point, business value)
 *   8. Send Slack messages to each squad lead (to #shin-test-space)
 *   9. Write/update the quarterly Confluence page
 */

import { JiraClient } from '../jira/client.js';
import type { JiraTicket } from '../jira/client.js';
import { withRetry } from '../utils/retry.js';
import { GroupingEngine } from '../grouping/engine.js';
import { computeImpactScore } from '../linking/scorer.js';
import { linkGroupToDeliveryProjects } from '../linking/matcher.js';
import type { ScoredGroup } from '../linking/scorer.js';
import { isFeatureTicket, buildFeatureDigests, sendFeatureDigestMessage } from '../digest/feature.js';
import type { WontDoFeatureCandidate, SquadLeadDigest } from '../digest/feature.js';
import type { ResurfacingResult } from '../resurfacing/index.js';
import { detectResurfacedTickets } from '../resurfacing/index.js';
import { identifyWontDoCandidates } from '../wont-do/router.js';
import {
  loadWontDoState,
  saveWontDoState,
  addPendingMessage,
} from '../wont-do/state.js';
import type { PendingTicket, PendingMessage } from '../wont-do/state.js';
import { ConfluenceClient, upsertQuarterlyPage, buildQuarterlyPageTitle } from '../confluence/client.js';
import { runAdoptionCheck } from '../adoption/tracker.js';
import { config } from '../config/index.js';
import { randomUUID } from 'crypto';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Determine link type names from Jira (with fallbacks).
 */
async function detectLinkTypes(
  jira: JiraClient
): Promise<{ groupingLinkType: string; deliveryLinkType: string }> {
  let groupingLinkType = 'Cloners';
  let deliveryLinkType = 'Relates';

  try {
    const linkTypes = await jira.getIssueLinkTypes();
    const preferredGrouping = linkTypes.find(
      (lt) =>
        lt.name.toLowerCase().includes('cloner') ||
        lt.name.toLowerCase().includes('parent') ||
        lt.name.toLowerCase().includes('blocks')
    );
    if (preferredGrouping) groupingLinkType = preferredGrouping.name;
    else if (linkTypes.length > 0) groupingLinkType = linkTypes[0]!.name;

    const preferredDelivery = linkTypes.find(
      (lt) =>
        lt.name.toLowerCase().includes('relate') ||
        lt.name.toLowerCase().includes('link')
    );
    if (preferredDelivery) deliveryLinkType = preferredDelivery.name;
    else if (linkTypes.length > 0) deliveryLinkType = linkTypes[0]!.name;
  } catch (err) {
    console.warn(`[MONTHLY DIGEST] Could not fetch link types, using defaults: ${err}`);
  }

  return { groupingLinkType, deliveryLinkType };
}

/**
 * Fetch all Parking Lot tickets enriched with custom fields.
 */
async function fetchParkingLotTicketsEnriched(jira: JiraClient): Promise<JiraTicket[]> {
  const customFieldIds = [
    config.jira.teamFieldId,
    config.impactScore.customerSegmentWeightFieldId,
    config.impactScore.aiSeverityFieldId,
  ];

  const baseTickets = await jira.getParkingLotTickets();

  const enriched: JiraTicket[] = [];
  for (const ticket of baseTickets) {
    try {
      const fullTicket = await jira.getIssue(ticket.key, [
        'summary', 'description', 'labels', 'reporter', 'created',
        'issuetype', 'status', 'priority',
        ...customFieldIds,
      ]);
      enriched.push(fullTicket);
    } catch (err) {
      console.warn(`[MONTHLY DIGEST] Could not enrich ticket ${ticket.key}: ${err}`);
      enriched.push(ticket);
    }
  }

  return enriched;
}

/**
 * Build a human-readable digest summary for Confluence.
 * One summary string per squad lead digest.
 */
function buildConfluenceSummaryForDigest(digest: SquadLeadDigest): string {
  const lines: string[] = [
    `Squad Lead: ${digest.squadLeadDisplayName} (Team: ${digest.teamName})`,
  ];

  if (digest.topThemes.length > 0) {
    lines.push(`Top ${digest.topThemes.length} feature theme(s):`);
    for (let i = 0; i < digest.topThemes.length; i++) {
      const t = digest.topThemes[i]!;
      const bv = t.synthesis?.businessValue ?? 'N/A';
      lines.push(
        `  ${i + 1}. ${t.theme} — ${t.uniqueUserCount} user(s), ` +
        `Impact: ${t.impactScore.toFixed(2)}, Business value: ${bv}, ` +
        `Ticket: ${t.parentTicketKey}`
      );
    }
  } else {
    lines.push('No feature themes this month.');
  }

  if (digest.notableTrends.length > 0) {
    lines.push(`Notable trends: ${digest.notableTrends.map((t) => t.theme).join('; ')}`);
  }

  if (digest.resurfacedTickets.length > 0) {
    const keys = digest.resurfacedTickets.map(
      (r) => `${r.ticketKey} (${r.newSimilarCount} new similar)`
    );
    lines.push(`Resurfaced Won't Do: ${keys.join(', ')}`);
  }

  return lines.join('\n');
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────

export interface MonthlyDigestResult {
  featureTicketsFound: number;
  digestsSent: number;
  wontDoCandidates: number;
  resurfacedTickets: number;
  confluencePageTitle: string | null;
}

/**
 * Main logic for generating and delivering the monthly feature digest.
 * Called by both the cron job and the HTTP trigger endpoint.
 */
export async function runMonthlyFeatureDigest(): Promise<MonthlyDigestResult> {
  const startTime = Date.now();
  const runAt = new Date();

  console.log('\n=== Monthly Feature Digest Pipeline (Sprint 5) ===');
  console.log(`Run started at: ${runAt.toISOString()}`);

  const jira = new JiraClient();

  // ── Step 1: Detect link types ──────────────────────────────────────────────
  const { groupingLinkType, deliveryLinkType } = await detectLinkTypes(jira);
  console.log(`[JIRA] Link types — grouping: "${groupingLinkType}", delivery: "${deliveryLinkType}"`);

  // ── Step 2: Fetch all Parking Lot tickets ──────────────────────────────────
  console.log('\n--- Fetching Parking Lot Tickets ---');
  let allParkingLotTickets: JiraTicket[];
  try {
    allParkingLotTickets = await withRetry(
      () => fetchParkingLotTicketsEnriched(jira),
      2,
      5000,
      'fetchParkingLotTicketsEnriched (monthly)'
    );
    console.log(`[JIRA] Retrieved ${allParkingLotTickets.length} Parking Lot tickets`);
  } catch (err) {
    const ts = new Date().toISOString();
    console.error(`[MONTHLY DIGEST] ${ts} — Failed to fetch Parking Lot tickets: ${err}`);
    throw err;
  }

  // ── Step 3: Filter for feature tickets ────────────────────────────────────
  const featureTickets = allParkingLotTickets.filter(isFeatureTicket);
  console.log(
    `[FILTER] Feature tickets found: ${featureTickets.length} / ${allParkingLotTickets.length}`
  );

  // ── Step 4: Run grouping + impact scoring + delivery linking ──────────────
  const engine = new GroupingEngine(jira, groupingLinkType);
  const groupingResult = await engine.run(allParkingLotTickets);

  console.log(`\nGrouping Summary:`);
  console.log(`  Groups formed: ${groupingResult.groups.length}`);
  console.log(`  Standalone tickets: ${groupingResult.standaloneTickets.length}`);

  // ── Step 5: Compute Impact Scores for feature groups ──────────────────────
  console.log('\n--- Computing Impact Scores ---');
  const scoredGroups: ScoredGroup[] = [];
  const impactScoreMap = new Map<string, number>();
  const linkedDeliveryKeys = new Set<string>(); // parent keys linked to delivery

  for (const group of groupingResult.groups) {
    const scored = computeImpactScore(group);

    try {
      const linkResult = await linkGroupToDeliveryProjects(
        group,
        jira,
        scored.impactScore,
        deliveryLinkType
      );
      scored.linkResult = linkResult;

      if (linkResult.matches.length > 0) {
        linkedDeliveryKeys.add(group.parent.key);
      }
    } catch (err) {
      console.warn(`[MONTHLY DIGEST] Could not link group ${group.parent.key}: ${err}`);
    }

    scoredGroups.push(scored);
    impactScoreMap.set(group.parent.key, scored.impactScore);
    console.log(
      `  ${group.parent.key}: impactScore=${scored.impactScore.toFixed(2)}, ` +
      `feature=${isFeatureTicket(group.parent)}`
    );
  }

  // Standalone feature tickets
  for (const ticket of groupingResult.standaloneTickets) {
    if (isFeatureTicket(ticket)) {
      const singleGroup = { parent: ticket, children: [], members: [ticket] };
      const scored = computeImpactScore(singleGroup);
      impactScoreMap.set(ticket.key, scored.impactScore);
    }
  }

  // ── Step 6: Identify Won't Do candidates for feature groups ──────────────
  console.log("\n--- Identifying Feature Won't Do Candidates ---");
  const featureScoredGroups = scoredGroups.filter((sg) => {
    const group = groupingResult.groups.find((g) => g.parent.key === sg.groupParentKey);
    return group ? isFeatureTicket(group.parent) : false;
  });

  const wontDoCandidatesRaw = await identifyWontDoCandidates(featureScoredGroups, jira);
  console.log(`Won't Do candidates (from feature groups): ${wontDoCandidatesRaw.length}`);

  const digestMessageId = randomUUID();
  const wontDoFeatureCandidates: WontDoFeatureCandidate[] = wontDoCandidatesRaw.map((c) => ({
    ticket: c.ticket,
    reason: c.reason,
    impactScore: c.impactScore,
    messageId: digestMessageId,
  }));

  // Persist Won't Do state for button-click handling
  if (wontDoCandidatesRaw.length > 0) {
    let wontDoState = loadWontDoState();
    const pendingTickets: PendingTicket[] = wontDoCandidatesRaw.map((c) => ({
      ticketKey: c.ticket.key,
      summary: c.ticket.summary,
      reason: c.reason,
      routingType: c.routingType,
      impactScore: c.impactScore,
      resolved: false,
      resolution: null,
    }));

    const pendingMessage: PendingMessage = {
      messageId: digestMessageId,
      slackMessageTs: '',
      channel: config.slack.channel,
      recipientSlackUserId: '',
      sentAt: new Date().toISOString(),
      reminderCount: 0,
      lastReminderAt: null,
      tickets: pendingTickets,
    };

    wontDoState = addPendingMessage(wontDoState, pendingMessage);
    saveWontDoState(wontDoState);
    console.log(`[MONTHLY DIGEST] Won't Do state saved for messageId=${digestMessageId}`);
  }

  // ── Step 7: Run resurfacing check ─────────────────────────────────────────
  console.log("\n--- Running Won't Do Resurfacing Check ---");
  let resurfacedResults: ResurfacingResult[] = [];
  try {
    resurfacedResults = await detectResurfacedTickets(allParkingLotTickets);
    console.log(`Resurfaced tickets (≥3 new similar): ${resurfacedResults.length}`);
  } catch (err) {
    console.warn(`[MONTHLY DIGEST] Resurfacing check failed: ${err}`);
  }

  // ── Step 8: Build per-squad-lead digests ──────────────────────────────────
  console.log('\n--- Building Feature Digests ---');
  const digests = await buildFeatureDigests(
    featureTickets,
    impactScoreMap,
    linkedDeliveryKeys,
    wontDoFeatureCandidates,
    resurfacedResults
  );

  console.log(`Built ${digests.length} squad lead digest(s)`);

  // ── Step 9: Send Slack messages ───────────────────────────────────────────
  console.log('\n--- Sending Monthly Feature Digest Slack Messages ---');
  let digestsSent = 0;

  for (const digest of digests) {
    console.log(
      `\n[SLACK] Sending digest for ${digest.squadLeadDisplayName} ` +
      `(team: ${digest.teamName}, topThemes: ${digest.topThemes.length})`
    );

    try {
      const ts = await sendFeatureDigestMessage(digest);
      digestsSent++;
      console.log(`[SLACK] Sent to ${config.slack.channel}, ts=${ts}`);
    } catch (err) {
      console.error(
        `[MONTHLY DIGEST] Failed to send digest for ${digest.squadLeadDisplayName}: ${err}`
      );
    }
  }

  // ── Step 10: Write/update the quarterly Confluence page ──────────────────
  console.log('\n--- Updating Quarterly Confluence Page ---');
  let confluencePageTitle: string | null = null;

  const confluenceEnabled =
    !!process.env['CONFLUENCE_BASE_URL'] &&
    !!process.env['CONFLUENCE_USER_EMAIL'] &&
    !!process.env['CONFLUENCE_API_TOKEN'];

  if (!confluenceEnabled) {
    console.log(
      '[MONTHLY DIGEST] Confluence env vars not set — skipping Confluence update. ' +
      '(Set CONFLUENCE_BASE_URL, CONFLUENCE_USER_EMAIL, CONFLUENCE_API_TOKEN to enable.)'
    );
  } else if (digests.length === 0) {
    console.log('[MONTHLY DIGEST] No digests to write to Confluence — skipping.');
  } else {
    try {
      const confluenceClient = new ConfluenceClient();
      const monthLabel = runAt.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      });

      // Check if this is the first run of a new quarter (page doesn't exist yet).
      // If so, run the adoption check so the count can be included on page creation.
      const pageTitle = buildQuarterlyPageTitle(runAt);
      const existingPage = await confluenceClient.findPageByTitle(pageTitle);
      let adoptionCount: number | undefined;

      if (!existingPage) {
        // New quarterly page — run adoption check and include the count
        console.log(
          `[MONTHLY DIGEST] New quarter detected (no page for "${pageTitle}") — running adoption check.`
        );
        try {
          const adoptionResult = await runAdoptionCheck();
          adoptionCount = adoptionResult.adoptedCount;
          console.log(
            `[MONTHLY DIGEST] Adoption count for Q${Math.ceil((runAt.getMonth() + 1) / 3)} ${runAt.getFullYear()}: ` +
            `${adoptionCount} / ${adoptionResult.totalParents} parent tickets adopted.`
          );
        } catch (adoptionErr) {
          console.warn(
            `[MONTHLY DIGEST] Adoption check failed — Confluence page will be created without adoption count: ${adoptionErr}`
          );
        }
      }

      // Build a human-readable summary per squad lead
      const digestSummaries = digests.map(buildConfluenceSummaryForDigest);

      await upsertQuarterlyPage(confluenceClient, monthLabel, digestSummaries, runAt, adoptionCount);

      confluencePageTitle = pageTitle;
      console.log(`[CONFLUENCE] Quarterly page "${confluencePageTitle}" updated.`);
    } catch (err) {
      console.error(`[MONTHLY DIGEST] Confluence update failed: ${err}`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const durationMs = Date.now() - startTime;
  console.log(`\n=== Sprint 5 Monthly Feature Digest Summary ===`);
  console.log(`Total Parking Lot tickets fetched: ${allParkingLotTickets.length}`);
  console.log(`Feature tickets identified: ${featureTickets.length}`);
  console.log(`Won't Do candidates (features): ${wontDoFeatureCandidates.length}`);
  console.log(`Resurfaced Won't Do tickets: ${resurfacedResults.length}`);
  console.log(`Digest messages sent: ${digestsSent} / ${digests.length}`);
  console.log(
    `Confluence page: ${confluencePageTitle ? '"' + confluencePageTitle + '"' : 'skipped'}`
  );
  console.log(`Duration: ${durationMs}ms`);
  console.log('\n=== Pipeline complete ===\n');

  return {
    featureTicketsFound: featureTickets.length,
    digestsSent,
    wontDoCandidates: wontDoFeatureCandidates.length,
    resurfacedTickets: resurfacedResults.length,
    confluencePageTitle,
  };
}

// ── Entry Point ───────────────────────────────────────────────────────────────

if (require.main === module) {
  console.log('[MONTHLY DIGEST] Running one-shot monthly feature digest...');
  runMonthlyFeatureDigest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[FATAL]', err);
      process.exit(1);
    });
}
