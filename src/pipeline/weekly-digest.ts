/**
 * Sprint 4 Pipeline: Weekly Bug Digest — Orchestrator
 *
 * Delivers a formatted bug report to the right Product Ops member in Slack
 * every Monday at 8:00 AM (configurable via WEEKLY_DIGEST_CRON).
 *
 * Capabilities:
 *   - Cron schedule trigger (node-cron, default: every Monday 8:00 AM)
 *   - HTTP trigger endpoint: POST /trigger/weekly-digest (on the existing Express server)
 *   - Audience routing: Darshini → Academy/Engage, Bryan → Identity & Payments,
 *                       Jin Choy → AI & Innovation/Transform
 *   - Bug-category ticket detection: by issue type OR label containing "bug"
 *   - Team assignment via custom field (JIRA_FIELD_TEAM, default: customfield_10060)
 *   - Theme grouping with unique user count + Impact Score per group
 *   - Inline Won't Do approval buttons (Approve + Approve All per team section)
 *   - Insufficient-description tickets get a dedicated section
 *   - Empty team sections are omitted (AC8)
 *   - No Confluence write
 *
 * Usage:
 *   pnpm weekly-digest              # one-shot run (ts-node)
 *   node dist/pipeline/weekly-digest.js  # compiled JS (starts cron + HTTP server)
 */

import { JiraClient } from '../jira/client.js';
import type { JiraTicket } from '../jira/client.js';
import { withRetry } from '../utils/retry.js';
import { GroupingEngine } from '../grouping/engine.js';
import { computeImpactScore } from '../linking/scorer.js';
import { linkGroupToDeliveryProjects } from '../linking/matcher.js';
import type { ScoredGroup } from '../linking/scorer.js';
import {
  isBugTicket,
  buildBugDigests,
  sendBugDigestMessage,
  deriveTeamFromTicket,
} from '../digest/bug.js';
import type { WontDoBugCandidate } from '../digest/bug.js';
import { identifyWontDoCandidates } from '../wont-do/router.js';
import {
  loadWontDoState,
  saveWontDoState,
  addPendingMessage,
} from '../wont-do/state.js';
import type { PendingTicket, PendingMessage } from '../wont-do/state.js';
import { config } from '../config/index.js';
import { randomUUID } from 'crypto';

// ── Core Digest Logic ──────────────────────────────────────────────────────────

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
    console.warn(`[WEEKLY DIGEST] Could not fetch link types, using defaults: ${err}`);
  }

  return { groupingLinkType, deliveryLinkType };
}

/**
 * Fetch all Parking Lot tickets enriched with the team custom field and
 * impact score fields. The base getParkingLotTickets() does not include custom
 * fields, so we follow up with per-ticket enrichment calls.
 */
async function fetchParkingLotTicketsEnriched(jira: JiraClient): Promise<JiraTicket[]> {
  const customFieldIds = [
    config.jira.teamFieldId,
    config.impactScore.customerSegmentWeightFieldId,
    config.impactScore.aiSeverityFieldId,
  ];

  // Fetch base Parking Lot tickets (without custom fields)
  const baseTickets = await jira.getParkingLotTickets();

  // Enrich each ticket with the team field + impact score fields
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
      console.warn(`[WEEKLY DIGEST] Could not enrich ticket ${ticket.key}: ${err}`);
      // Fall back to the base ticket (no custom fields)
      enriched.push(ticket);
    }
  }

  return enriched;
}

/**
 * Main logic for generating and delivering the weekly bug digest.
 * Called by both the cron job and the HTTP trigger endpoint.
 */
export async function runWeeklyBugDigest(): Promise<{
  bugTicketsFound: number;
  digestsSent: number;
  wontDoCandidates: number;
}> {
  const startTime = Date.now();
  const runAt = new Date();

  console.log('\n=== Weekly Bug Digest Pipeline (Sprint 4) ===');
  console.log(`Run started at: ${runAt.toISOString()}`);

  const jira = new JiraClient();

  // ── Step 1: Detect link types ──────────────────────────────────────────────
  const { groupingLinkType, deliveryLinkType } = await detectLinkTypes(jira);
  console.log(`[JIRA] Link types — grouping: "${groupingLinkType}", delivery: "${deliveryLinkType}"`);

  // ── Step 2: Fetch all Parking Lot tickets (with team + impact fields) ──────
  console.log('\n--- Fetching Parking Lot Tickets ---');
  let allParkingLotTickets: JiraTicket[];
  try {
    allParkingLotTickets = await withRetry(
      () => fetchParkingLotTicketsEnriched(jira),
      2,
      5000,
      'fetchParkingLotTicketsEnriched (weekly)'
    );
    console.log(`[JIRA] Retrieved ${allParkingLotTickets.length} Parking Lot tickets`);
  } catch (err) {
    const ts = new Date().toISOString();
    console.error(`[WEEKLY DIGEST] ${ts} — Failed to fetch Parking Lot tickets: ${err}`);
    throw err;
  }

  // ── Step 3: Filter for bug-category tickets ────────────────────────────────
  const bugTickets = allParkingLotTickets.filter(isBugTicket);
  console.log(`[FILTER] Bug tickets found: ${bugTickets.length} / ${allParkingLotTickets.length}`);

  // ── Step 4: Run grouping on bug tickets to build groups ────────────────────
  // We group ALL parking lot tickets to build proper groups with Impact Scores,
  // then filter the groups to keep only those where the parent is a bug ticket.
  const engine = new GroupingEngine(jira, groupingLinkType);
  const groupingResult = await engine.run(allParkingLotTickets);

  console.log(`\nGrouping Summary:`);
  console.log(`  Groups formed: ${groupingResult.groups.length}`);
  console.log(`  Standalone tickets: ${groupingResult.standaloneTickets.length}`);

  // ── Step 5: Compute Impact Scores for bug groups ──────────────────────────
  console.log('\n--- Computing Impact Scores ---');
  const scoredGroups: ScoredGroup[] = [];
  const impactScoreMap = new Map<string, number>(); // ticketKey → impactScore

  for (const group of groupingResult.groups) {
    // Only process groups whose parent is a bug ticket
    // (child tickets may add impact even if not bugs themselves)
    const scored = computeImpactScore(group);

    // Run cross-project linking for delivery match context
    try {
      const linkResult = await linkGroupToDeliveryProjects(
        group,
        jira,
        scored.impactScore,
        deliveryLinkType
      );
      scored.linkResult = linkResult;
    } catch (err) {
      console.warn(`[WEEKLY DIGEST] Could not link group ${group.parent.key}: ${err}`);
    }

    scoredGroups.push(scored);
    impactScoreMap.set(group.parent.key, scored.impactScore);
    console.log(
      `  ${group.parent.key}: impactScore=${scored.impactScore.toFixed(2)}, ` +
      `bug=${isBugTicket(group.parent)}, team=${deriveTeamFromTicket(group.parent) ?? 'unknown'}`
    );
  }

  // Also compute standalone bug tickets (they form singleton groups)
  for (const ticket of groupingResult.standaloneTickets) {
    if (isBugTicket(ticket)) {
      // Standalone ticket — impactScore defaults to customerSegmentWeight * aiSeverity * 1
      const singleGroup = { parent: ticket, children: [], members: [ticket] };
      const scored = computeImpactScore(singleGroup);
      impactScoreMap.set(ticket.key, scored.impactScore);
    }
  }

  // ── Step 6: Identify Won't Do candidates for bug tickets ──────────────────
  console.log('\n--- Identifying Won\'t Do Candidates ---');

  // Filter scored groups to those with bug parent tickets
  const bugScoredGroups = scoredGroups.filter((sg) => {
    const group = groupingResult.groups.find((g) => g.parent.key === sg.groupParentKey);
    return group ? isBugTicket(group.parent) : false;
  });

  const wontDoCandidatesRaw = await identifyWontDoCandidates(bugScoredGroups, jira);
  console.log(`Won't Do candidates (from bug groups): ${wontDoCandidatesRaw.length}`);

  // Convert to WontDoBugCandidate with a messageId for the digest buttons
  const digestMessageId = randomUUID();
  const wontDoBugCandidates: WontDoBugCandidate[] = wontDoCandidatesRaw.map((c) => ({
    ticket: c.ticket,
    reason: c.reason,
    impactScore: c.impactScore,
    messageId: digestMessageId,
  }));

  // Persist Won't Do state so the existing interaction server can handle button clicks
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
      slackMessageTs: '', // will be updated after send
      channel: config.slack.channel,
      recipientSlackUserId: '', // digest sends to channel, not DM
      sentAt: new Date().toISOString(),
      reminderCount: 0,
      lastReminderAt: null,
      tickets: pendingTickets,
    };

    wontDoState = addPendingMessage(wontDoState, pendingMessage);
    saveWontDoState(wontDoState);
    console.log(`[WEEKLY DIGEST] Won't Do state saved for messageId=${digestMessageId}`);
  }

  // ── Step 7: Build digests per Product Ops member ──────────────────────────
  console.log('\n--- Building Bug Digests ---');
  const digests = buildBugDigests(bugTickets, impactScoreMap, wontDoBugCandidates);

  // ── Step 8: Send Slack messages ───────────────────────────────────────────
  console.log('\n--- Sending Slack Bug Digest Messages ---');
  let digestsSent = 0;

  for (const digest of digests) {
    console.log(
      `\n[SLACK] Sending digest for ${digest.recipientDisplayName} ` +
      `(${digest.teamSections.length} team section(s), hasNoBugs=${digest.hasNoBugTickets})`
    );

    try {
      const ts = await sendBugDigestMessage(digest);
      digestsSent++;
      console.log(`[SLACK] Sent to ${config.slack.channel}, ts=${ts}`);
    } catch (err) {
      console.error(
        `[WEEKLY DIGEST] Failed to send digest for ${digest.recipientDisplayName}: ${err}`
      );
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const durationMs = Date.now() - startTime;
  console.log(`\n=== Sprint 4 Weekly Bug Digest Summary ===`);
  console.log(`Total Parking Lot tickets fetched: ${allParkingLotTickets.length}`);
  console.log(`Bug tickets identified: ${bugTickets.length}`);
  console.log(`Won't Do candidates: ${wontDoBugCandidates.length}`);
  console.log(`Digest messages sent: ${digestsSent} / ${digests.length}`);
  console.log(`Duration: ${durationMs}ms`);
  console.log('\n=== Pipeline complete ===\n');

  return {
    bugTicketsFound: bugTickets.length,
    digestsSent,
    wontDoCandidates: wontDoBugCandidates.length,
  };
}

// ── Entry Point ───────────────────────────────────────────────────────────────

/**
 * When run directly (not imported as a module by server.ts), perform a
 * one-shot digest run and exit.
 *
 * The cron schedule and HTTP trigger endpoint live in src/wont-do/server.ts
 * so that they share the same Express server process as the Slack interactions
 * webhook. This avoids port conflicts and keeps everything in a single process.
 *
 * Usage:
 *   pnpm weekly-digest        # one-shot run (this path)
 *   pnpm server               # long-running server with cron + interactions
 */
if (require.main === module) {
  console.log('[WEEKLY DIGEST] Running one-shot bug digest...');
  runWeeklyBugDigest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[FATAL]', err);
      process.exit(1);
    });
}
