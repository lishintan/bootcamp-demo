/**
 * Main entry point: Semantic Ticket Grouping Pipeline
 *
 * Usage:
 *   pnpm start            # compiled JS
 *   pnpm group            # via ts-node
 *
 * This script:
 * 1. Loads run state to determine if this is a first run or incremental run
 * 2. Fetches Parking Lot tickets from Jira (all historical on first run, since lastRunAt on subsequent runs)
 * 3. Groups tickets semantically using Claude
 * 4. Creates parent-child Jira links for matched tickets
 * 5. Persists run state and writes a log entry
 */

import { JiraClient } from '../jira/client.js';
import { GroupingEngine } from '../grouping/engine.js';
import { loadRunState, saveRunState, advanceRunState, getSinceDate } from '../state/index.js';
import { writeRunLog } from '../logger/index.js';
import { computeDeduplicatedSignals } from '../grouping/deduplication.js';
import { config } from '../config/index.js';

async function main(): Promise<void> {
  const startTime = Date.now();
  const runAt = new Date();

  console.log(`\n=== Feedback Grouping Pipeline ===`);
  console.log(`Run started at: ${runAt.toISOString()}`);

  // Load state to determine incremental vs full run
  const state = loadRunState();
  const sinceDate = getSinceDate(state);

  if (sinceDate) {
    console.log(`[STATE] Incremental run — processing tickets created after ${sinceDate.toISOString()}`);
  } else {
    console.log(`[STATE] First run — processing all historical Parking Lot tickets`);
  }

  // Initialize Jira client
  const jira = new JiraClient();

  // Determine link type to use
  console.log(`[JIRA] Fetching available link types...`);
  let linkTypeName = 'Cloners';
  try {
    const linkTypes = await jira.getIssueLinkTypes();
    // Prefer a "relates to" or "cloners" link type; fall back to first available
    const preferred = linkTypes.find(
      (lt) =>
        lt.name.toLowerCase().includes('cloner') ||
        lt.name.toLowerCase().includes('parent') ||
        lt.name.toLowerCase().includes('blocks')
    );
    if (preferred) {
      linkTypeName = preferred.name;
    } else if (linkTypes.length > 0) {
      linkTypeName = linkTypes[0]!.name;
    }
    console.log(`[JIRA] Using link type: "${linkTypeName}"`);
  } catch (err) {
    console.warn(`[WARN] Could not fetch link types, using default "${linkTypeName}":`, err);
  }

  // Fetch tickets
  console.log(`[JIRA] Fetching Parking Lot tickets...`);
  const tickets = await jira.getParkingLotTickets(sinceDate);
  console.log(`[JIRA] Retrieved ${tickets.length} tickets`);

  if (tickets.length === 0) {
    console.log(`[PIPELINE] No tickets to process. Exiting.`);

    // Still write a log entry for the zero-ticket run
    const newState = advanceRunState(state, runAt);
    saveRunState(newState);

    writeRunLog({
      timestamp: runAt.toISOString(),
      runNumber: newState.totalRunsCompleted,
      ticketsProcessed: 0,
      groupsCreated: 0,
      groupsUpdated: 0,
      linksCreated: 0,
      securitySkipped: 0,
      standaloneTickets: 0,
      sinceDate: sinceDate?.toISOString() ?? null,
      durationMs: Date.now() - startTime,
    });
    return;
  }

  // Run grouping engine
  console.log(`[ENGINE] Starting semantic grouping (threshold: ${(config.similarityThreshold * 100).toFixed(0)}%)...`);
  const engine = new GroupingEngine(jira, linkTypeName);
  const result = await engine.run(tickets);

  // Print summary
  console.log(`\n--- Grouping Summary ---`);
  console.log(`Groups formed: ${result.groups.length}`);
  console.log(`Standalone tickets: ${result.standaloneTickets.length}`);
  console.log(`Security/compliance skipped: ${result.securitySkipped.length}`);
  console.log(`Jira links created: ${result.newLinksCreated}`);

  // Print deduplicated signal counts per group
  if (result.groups.length > 0) {
    console.log(`\n--- Group Details ---`);
    for (const group of result.groups) {
      const dedup = computeDeduplicatedSignals(group.parent, group.children);
      console.log(
        `  Group ${group.parent.key}: ${group.children.length} children, ` +
        `${dedup.uniqueSignalCount} unique user signal(s)`
      );
      if (group.children.length > 0) {
        console.log(`    Children: ${group.children.map((c) => c.key).join(', ')}`);
      }
    }
  }

  // Persist state
  const newState = advanceRunState(state, runAt);
  saveRunState(newState);
  console.log(`\n[STATE] Run state saved (run #${newState.totalRunsCompleted})`);

  // Write run log (AC #8)
  writeRunLog({
    timestamp: runAt.toISOString(),
    runNumber: newState.totalRunsCompleted,
    ticketsProcessed: tickets.length,
    groupsCreated: result.groupsCreated,
    groupsUpdated: result.groupsUpdated,
    linksCreated: result.newLinksCreated,
    securitySkipped: result.securitySkipped.length,
    standaloneTickets: result.standaloneTickets.length,
    sinceDate: sinceDate?.toISOString() ?? null,
    durationMs: Date.now() - startTime,
  });

  console.log(`\n=== Pipeline complete ===\n`);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
