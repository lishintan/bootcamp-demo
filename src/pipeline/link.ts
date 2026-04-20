/**
 * Sprint 2 Pipeline: Cross-Project Linker & Impact Ranking
 *
 * Usage:
 *   pnpm link             # via ts-node
 *   node dist/pipeline/link.js   # compiled JS
 *
 * This script:
 * 1. Runs the Sprint 1 grouping pipeline to get the current set of ticket groups
 * 2. Computes Impact Scores for each group using Jira custom fields
 * 3. Semantically matches each group against open work items in the five delivery teams
 * 4. Creates bidirectional Jira links between matched Product Feedback parents and delivery work items
 * 5. Surfaces priority-bump recommendations (read-only) for high-impact groups
 * 6. Produces a ranked top-5 digest per team as structured JSON output
 */

import { JiraClient } from '../jira/client.js';
import { GroupingEngine } from '../grouping/engine.js';
import { loadRunState, saveRunState, advanceRunState, getSinceDate } from '../state/index.js';
import { computeImpactScore, rankGroupsForDigest } from '../linking/scorer.js';
import { linkGroupToDeliveryProjects } from '../linking/matcher.js';
import type { ScoredGroup } from '../linking/scorer.js';
import type { TeamDigestEntry } from '../linking/scorer.js';
import { config } from '../config/index.js';
import * as fs from 'fs';
import * as path from 'path';

export interface LinkPipelineResult {
  /** Scored groups (all groups, with or without delivery matches) */
  scoredGroups: ScoredGroup[];
  /** Per-team ranked top-5 digest */
  teamDigest: TeamDigestEntry[];
  /** Total bidirectional Jira links created */
  linksCreated: number;
  /** Total groups with at least one delivery match */
  groupsLinked: number;
  /** Total groups with no delivery match */
  groupsUnlinked: number;
  /** Total priority-bump recommendations surfaced */
  priorityBumpRecommendations: number;
}

async function main(): Promise<void> {
  const startTime = Date.now();
  const runAt = new Date();

  console.log('\n=== Cross-Project Linker & Impact Ranking Pipeline ===');
  console.log(`Run started at: ${runAt.toISOString()}`);
  console.log(`Team project keys: ${JSON.stringify(config.jira.teamProjectKeys)}`);

  // ── Step 1: Run grouping to get current groups ────────────────────────────
  const state = loadRunState();
  const sinceDate = getSinceDate(state);

  if (sinceDate) {
    console.log(
      `[STATE] Incremental run — processing tickets created after ${sinceDate.toISOString()}`
    );
  } else {
    console.log('[STATE] First run — processing all historical Parking Lot tickets');
  }

  const jira = new JiraClient();

  // Determine link type
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
    if (preferredGrouping) {
      groupingLinkType = preferredGrouping.name;
    } else if (linkTypes.length > 0) {
      groupingLinkType = linkTypes[0]!.name;
    }

    const preferredDelivery = linkTypes.find(
      (lt) =>
        lt.name.toLowerCase().includes('relate') ||
        lt.name.toLowerCase().includes('link')
    );
    if (preferredDelivery) {
      deliveryLinkType = preferredDelivery.name;
    } else if (linkTypes.length > 0) {
      deliveryLinkType = linkTypes[0]!.name;
    }

    console.log(
      `[JIRA] Grouping link type: "${groupingLinkType}", Delivery link type: "${deliveryLinkType}"`
    );
  } catch (err) {
    console.warn(
      `[WARN] Could not fetch link types, using defaults (grouping: "${groupingLinkType}", delivery: "${deliveryLinkType}"): ${err}`
    );
  }

  // Fetch and group tickets
  console.log('[JIRA] Fetching Parking Lot tickets...');
  const tickets = await jira.getParkingLotTickets(sinceDate);
  console.log(`[JIRA] Retrieved ${tickets.length} tickets`);

  if (tickets.length === 0) {
    console.log('[PIPELINE] No tickets to process. Exiting.');
    return;
  }

  console.log(
    `[ENGINE] Running semantic grouping (threshold: ${(config.similarityThreshold * 100).toFixed(0)}%)...`
  );
  const engine = new GroupingEngine(jira, groupingLinkType);
  const groupingResult = await engine.run(tickets);

  console.log(`\n--- Grouping Summary ---`);
  console.log(`Groups formed: ${groupingResult.groups.length}`);
  console.log(`Standalone tickets: ${groupingResult.standaloneTickets.length}`);
  console.log(`Security/compliance skipped: ${groupingResult.securitySkipped.length}`);
  console.log(`Jira links created: ${groupingResult.newLinksCreated}`);

  if (groupingResult.groups.length === 0) {
    console.log('[PIPELINE] No groups to link. Exiting.');
    // Advance state so incremental runs work correctly
    const newState = advanceRunState(state, runAt);
    saveRunState(newState);
    return;
  }

  // ── Step 2: Compute Impact Scores ─────────────────────────────────────────
  console.log('\n--- Computing Impact Scores ---');
  const scoredGroups: ScoredGroup[] = [];

  for (const group of groupingResult.groups) {
    // Re-fetch parent ticket with custom fields for impact score computation
    const customFieldIds = [
      config.impactScore.customerSegmentWeightFieldId,
      config.impactScore.aiSeverityFieldId,
    ];

    try {
      const enrichedParent = await jira.getIssue(group.parent.key, [
        'summary', 'description', 'labels', 'reporter', 'created',
        'issuetype', 'status', 'priority',
        ...customFieldIds,
      ]);
      // Replace the parent with the enriched version (contains custom fields)
      const enrichedGroup = { ...group, parent: enrichedParent };
      const scored = computeImpactScore(enrichedGroup);
      scoredGroups.push(scored);
      console.log(
        `  ${group.parent.key}: linkedCount=${scored.linkedTicketCount}, ` +
          `segmentWeight=${scored.customerSegmentWeight}, ` +
          `aiSeverity=${scored.aiSeverity}, ` +
          `impactScore=${scored.impactScore.toFixed(2)}`
      );
    } catch (err) {
      console.warn(
        `[WARN] Could not enrich parent ${group.parent.key} with custom fields, ` +
          `using defaults: ${err}`
      );
      const scored = computeImpactScore(group);
      scoredGroups.push(scored);
    }
  }

  // ── Step 3: Cross-project matching and link creation ──────────────────────
  console.log('\n--- Cross-Project Linking ---');
  let totalLinksCreated = 0;
  let groupsLinked = 0;
  let groupsUnlinked = 0;
  let priorityBumpCount = 0;

  for (let i = 0; i < groupingResult.groups.length; i++) {
    const group = groupingResult.groups[i]!;
    const scored = scoredGroups[i]!;

    console.log(
      `\n[LINKER] Processing group ${scored.groupParentKey} ` +
        `(Impact Score: ${scored.impactScore.toFixed(2)})...`
    );

    const linkResult = await linkGroupToDeliveryProjects(
      group,
      jira,
      scored.impactScore,
      deliveryLinkType
    );

    // Attach link result to scored group
    scored.linkResult = linkResult;

    const newLinks = linkResult.matches.filter((m) => m.linkCreated).length;
    totalLinksCreated += newLinks;

    if (linkResult.matches.length > 0) {
      groupsLinked++;
      console.log(
        `  ✓ Linked to ${linkResult.matches.length} delivery work item(s): ` +
          linkResult.matches.map((m) => `${m.workItem.key} (${m.teamName})`).join(', ')
      );
    } else {
      groupsUnlinked++;
      console.log(`  — ${linkResult.noMatchMessage ?? 'Not linked to any delivery work item'}`);
    }

    if (linkResult.priorityBumpRecommendation) {
      priorityBumpCount++;
      console.log(
        `  ⚑ Priority-bump recommendation: ${linkResult.priorityBumpRecommendation.message}`
      );
    }
  }

  // ── Step 4: Rank and produce team digest ──────────────────────────────────
  console.log('\n--- Team Digest (Top Groups per Team) ---');
  const teamDigest = rankGroupsForDigest(scoredGroups);

  for (const entry of teamDigest) {
    if (entry.topGroups.length === 0) {
      console.log(`\n${entry.teamName}: No matched groups`);
      continue;
    }
    console.log(`\n${entry.teamName}:`);
    for (let rank = 0; rank < entry.topGroups.length; rank++) {
      const sg = entry.topGroups[rank]!;
      const matchKeys = sg.linkResult.matches
        .map((m) => m.workItem.key)
        .join(', ');
      console.log(
        `  #${rank + 1} ${sg.groupParentKey} — Impact Score: ${sg.impactScore.toFixed(2)} ` +
          `→ delivery: ${matchKeys || 'none'}`
      );
      if (sg.linkResult.priorityBumpRecommendation) {
        console.log(
          `       ⚑ Bump recommendation: ${sg.linkResult.priorityBumpRecommendation.workItemUrl}`
        );
      }
    }
  }

  // ── Step 5: Write structured digest output ────────────────────────────────
  const digestOutput: LinkPipelineResult = {
    scoredGroups,
    teamDigest,
    linksCreated: totalLinksCreated,
    groupsLinked,
    groupsUnlinked,
    priorityBumpRecommendations: priorityBumpCount,
  };

  const digestPath = path.join(process.cwd(), 'logs', 'link-digest.json');
  try {
    const dir = path.dirname(digestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(digestPath, JSON.stringify(digestOutput, null, 2), 'utf-8');
    console.log(`\n[OUTPUT] Digest written to ${digestPath}`);
  } catch (err) {
    console.warn(`[WARN] Could not write digest file: ${err}`);
  }

  // ── Step 6: Persist state ─────────────────────────────────────────────────
  const newState = advanceRunState(state, runAt);
  saveRunState(newState);

  const durationMs = Date.now() - startTime;
  console.log(`\n--- Sprint 2 Pipeline Summary ---`);
  console.log(`Groups processed: ${groupingResult.groups.length}`);
  console.log(`Groups linked to delivery: ${groupsLinked}`);
  console.log(`Groups unlinked: ${groupsUnlinked}`);
  console.log(`Bidirectional Jira links created: ${totalLinksCreated}`);
  console.log(`Priority-bump recommendations: ${priorityBumpCount}`);
  console.log(`Duration: ${durationMs}ms`);
  console.log('\n=== Pipeline complete ===\n');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
