/**
 * Sprint 3 Pipeline: Won't Do Candidate Identification & Slack Approval Flow
 *
 * Usage:
 *   pnpm wont-do              # via ts-node
 *   node dist/pipeline/wont-do.js  # compiled JS
 *
 * This script:
 * 1. Runs the grouping pipeline (Sprint 1) to get current ticket groups
 * 2. Runs the linking pipeline (Sprint 2) to compute Impact Scores and delivery matches
 * 3. Applies three Won't Do candidate rules:
 *    a. Insufficient description → Product Ops
 *    b. Sprint-locked delivery item → Squad Lead
 *    c. Low impact score → Squad Lead
 * 4. Groups candidates by recipient Slack user ID
 * 5. Sends Slack Block Kit messages to #shin-test-space with per-ticket Approve/Skip
 *    and a global Approve All button
 * 6. Persists pending approval state to state/wont-do-state.json
 * 7. (Separate server process handles button-click interactions)
 * 8. Processes any pending reminders for previously sent messages
 *
 * To run the interaction server (required for button clicks):
 *   pnpm server
 */

import { randomUUID } from 'crypto';
import { JiraClient } from '../jira/client.js';
import { GroupingEngine } from '../grouping/engine.js';
import { loadRunState, getSinceDate } from '../state/index.js';
import { computeImpactScore } from '../linking/scorer.js';
import { linkGroupToDeliveryProjects } from '../linking/matcher.js';
import type { ScoredGroup } from '../linking/scorer.js';
import { identifyWontDoCandidates } from '../wont-do/router.js';
import type { WontDoCandidate } from '../wont-do/router.js';
import { sendWontDoApprovalMessage } from '../wont-do/slack.js';
import {
  loadWontDoState,
  saveWontDoState,
  addPendingMessage,
} from '../wont-do/state.js';
import type { PendingMessage, PendingTicket } from '../wont-do/state.js';
import { processReminders } from '../wont-do/reminders.js';
import { config } from '../config/index.js';

async function main(): Promise<void> {
  const startTime = Date.now();
  const runAt = new Date();

  console.log('\n=== Won\'t Do Candidate Pipeline (Sprint 3) ===');
  console.log(`Run started at: ${runAt.toISOString()}`);

  // ── Step 1: Process any pending reminders from prior runs ─────────────────
  console.log('\n--- Processing Pending Reminders ---');
  const remindersSent = await processReminders();
  console.log(`Reminders sent: ${remindersSent}`);

  // ── Step 2: Run grouping to get current ticket groups ──────────────────────
  const state = loadRunState();
  const sinceDate = getSinceDate(state);

  if (sinceDate) {
    console.log(
      `\n[STATE] Incremental run — processing tickets created after ${sinceDate.toISOString()}`
    );
  } else {
    console.log('\n[STATE] First run — processing all historical Parking Lot tickets');
  }

  const jira = new JiraClient();

  // Determine link types
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

    console.log(`\n[JIRA] Link types — grouping: "${groupingLinkType}", delivery: "${deliveryLinkType}"`);
  } catch (err) {
    console.warn(`[WARN] Could not fetch link types, using defaults: ${err}`);
  }

  // Fetch and group tickets
  console.log('\n--- Grouping Parking Lot Tickets ---');
  console.log('[JIRA] Fetching Parking Lot tickets...');
  const tickets = await jira.getParkingLotTickets(sinceDate);
  console.log(`[JIRA] Retrieved ${tickets.length} tickets`);

  if (tickets.length === 0) {
    console.log('[PIPELINE] No new tickets to process. Exiting.');
    return;
  }

  const engine = new GroupingEngine(jira, groupingLinkType);
  const groupingResult = await engine.run(tickets);

  console.log(`\nGrouping Summary:`);
  console.log(`  Groups formed: ${groupingResult.groups.length}`);
  console.log(`  Standalone tickets: ${groupingResult.standaloneTickets.length}`);
  console.log(`  Security/compliance skipped: ${groupingResult.securitySkipped.length}`);

  if (groupingResult.groups.length === 0) {
    console.log('[PIPELINE] No groups to evaluate. Exiting.');
    return;
  }

  // ── Step 3: Compute Impact Scores and link to delivery projects ───────────
  console.log('\n--- Computing Impact Scores & Delivery Matching ---');
  const scoredGroups: ScoredGroup[] = [];

  for (const group of groupingResult.groups) {
    const customFieldIds = [
      config.impactScore.customerSegmentWeightFieldId,
      config.impactScore.aiSeverityFieldId,
    ];

    let enrichedGroup = group;
    try {
      const enrichedParent = await jira.getIssue(group.parent.key, [
        'summary', 'description', 'labels', 'reporter', 'created',
        'issuetype', 'status', 'priority',
        ...customFieldIds,
      ]);
      enrichedGroup = { ...group, parent: enrichedParent };
    } catch (err) {
      console.warn(`[WARN] Could not enrich ${group.parent.key}, using defaults: ${err}`);
    }

    const scored = computeImpactScore(enrichedGroup);

    // Run cross-project linking (read existing links, don't create new ones here)
    try {
      const linkResult = await linkGroupToDeliveryProjects(
        enrichedGroup,
        jira,
        scored.impactScore,
        deliveryLinkType
      );
      scored.linkResult = linkResult;
    } catch (err) {
      console.warn(`[WARN] Could not link group ${group.parent.key}: ${err}`);
    }

    scoredGroups.push(scored);
    console.log(
      `  ${group.parent.key}: impactScore=${scored.impactScore.toFixed(2)}, ` +
      `matches=${scored.linkResult.matches.length}`
    );
  }

  // ── Step 4: Identify Won't Do candidates ──────────────────────────────────
  console.log('\n--- Identifying Won\'t Do Candidates ---');
  const candidates = await identifyWontDoCandidates(scoredGroups, jira);

  console.log(`\nWon't Do candidates identified: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('[PIPELINE] No Won\'t Do candidates found. Exiting.');
    return;
  }

  for (const c of candidates) {
    console.log(
      `  ${c.ticket.key} — rule: ${c.ruleTriggered}, team: ${c.teamName}, ` +
      `recipient: ${c.recipientSlackUserId || '(not configured)'}`
    );
  }

  // ── Step 5: Group candidates by recipient ──────────────────────────────────
  // Each recipient gets a single Slack message containing all their tickets
  const byRecipient = new Map<string, WontDoCandidate[]>();
  for (const candidate of candidates) {
    const recipientId = candidate.recipientSlackUserId || 'unassigned';
    const existing = byRecipient.get(recipientId) ?? [];
    existing.push(candidate);
    byRecipient.set(recipientId, existing);
  }

  // ── Step 6: Send Slack messages and persist state ─────────────────────────
  console.log('\n--- Sending Slack Approval Messages ---');
  let wontDoState = loadWontDoState();
  let messagesSent = 0;

  for (const [recipientId, recipientCandidates] of byRecipient.entries()) {
    const messageId = randomUUID();

    // Build pending tickets for state
    const pendingTickets: PendingTicket[] = recipientCandidates.map((c) => ({
      ticketKey: c.ticket.key,
      summary: c.ticket.summary,
      reason: c.reason,
      routingType: c.routingType,
      impactScore: c.impactScore,
      resolved: false,
      resolution: null,
    }));

    let slackTs = '';
    try {
      slackTs = await sendWontDoApprovalMessage(
        messageId,
        recipientCandidates,
        recipientId,
        false
      );
      messagesSent++;
    } catch (err) {
      console.error(
        `[PIPELINE] Failed to send Slack message for recipient ${recipientId}: ${err}`
      );
      // Still persist state so reminders can be attempted later
    }

    const pendingMessage: PendingMessage = {
      messageId,
      slackMessageTs: slackTs,
      channel: config.slack.channel,
      recipientSlackUserId: recipientId,
      sentAt: new Date().toISOString(),
      reminderCount: 0,
      lastReminderAt: null,
      tickets: pendingTickets,
    };

    wontDoState = addPendingMessage(wontDoState, pendingMessage);
    console.log(
      `[PIPELINE] Message ${messageId} queued for ${recipientId} ` +
      `(${recipientCandidates.length} ticket(s))`
    );
  }

  saveWontDoState(wontDoState);

  // ── Summary ────────────────────────────────────────────────────────────────
  const durationMs = Date.now() - startTime;
  console.log(`\n=== Sprint 3 Pipeline Summary ===`);
  console.log(`Tickets evaluated: ${scoredGroups.length}`);
  console.log(`Won't Do candidates identified: ${candidates.length}`);
  console.log(`Slack messages sent: ${messagesSent}`);
  console.log(`Reminders sent (prior runs): ${remindersSent}`);
  console.log(`State persisted to: ${config.wontDo.statePath}`);
  console.log(`Duration: ${durationMs}ms`);
  console.log('\n=== Pipeline complete ===\n');

  console.log('To handle button clicks, run the interaction server:');
  console.log('  pnpm server');
  console.log('\nTo send reminders for pending messages, re-run this pipeline.');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
