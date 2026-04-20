/**
 * Slack Interaction Webhook Server
 *
 * Express HTTP server that handles Slack interactive button payloads.
 * Listens on PORT env var (default 3000).
 *
 * Slack sends a POST to /slack/interactions when a user clicks a button.
 * Payload format: application/x-www-form-urlencoded with field "payload" (JSON string).
 *
 * Supported actions:
 *   wont_do_approve_{ticketKey}  → approve a single ticket
 *   wont_do_skip_{ticketKey}     → skip a single ticket
 *   wont_do_approve_all          → approve all unresolved tickets in the message
 *
 * After handling:
 *   - Updates Jira ticket status to "Won't Do" (approve action)
 *   - Updates the state file
 *   - Responds to Slack with a 200 OK immediately (Slack requires < 3s response)
 */

import express, { Request, Response } from 'express';
import * as cron from 'node-cron';
import { JiraClient } from '../jira/client.js';
import {
  loadWontDoState,
  saveWontDoState,
  resolveTicketInMessage,
  resolveAllTicketsInMessage,
  findMessageById,
} from './state.js';
import type { SlackButtonPayload } from './slack.js';
import { runWeeklyBugDigest } from '../pipeline/weekly-digest.js';
import { runMonthlyFeatureDigest } from '../pipeline/monthly-digest.js';
import { runAdoptionCheck } from '../adoption/tracker.js';
import {
  loadResurfacingState,
  saveResurfacingState,
  recordWontDoByKey,
} from '../resurfacing/index.js';
import { deriveTeamFromTicket } from '../digest/bug.js';
import { config } from '../config/index.js';

// ── In-memory job locks (AC7 idempotency guard) ────────────────────────────────
// Prevents duplicate runs when a job is triggered via HTTP while already running,
// or when the cron fires while the previous run is still in progress.

type JobType = 'weekly' | 'monthly' | 'quarterly';
const jobRunning: Record<JobType, boolean> = {
  weekly: false,
  monthly: false,
  quarterly: false,
};

/**
 * Attempt to acquire the in-memory lock for a job type.
 * Returns true if the lock was acquired (job is now marked as running).
 * Returns false if the job is already running.
 */
function acquireLock(job: JobType): boolean {
  if (jobRunning[job]) return false;
  jobRunning[job] = true;
  return true;
}

/**
 * Release the in-memory lock for a job type.
 */
function releaseLock(job: JobType): void {
  jobRunning[job] = false;
}

const app: express.Application = express();

// Parse URL-encoded bodies (Slack sends payload as form-encoded)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'wont-do-slack-server' });
});

/**
 * Main interaction endpoint.
 * Slack sends POST to this URL when a user clicks an interactive element.
 */
app.post('/slack/interactions', async (req: Request, res: Response) => {
  // Immediately acknowledge the request to Slack (must respond within 3 seconds)
  res.status(200).send('');

  let payload: {
    type: string;
    actions?: Array<{
      action_id: string;
      value?: string;
    }>;
    message?: {
      ts?: string;
    };
    channel?: {
      id?: string;
    };
    user?: {
      id?: string;
    };
  };

  try {
    const rawPayload = req.body?.payload;
    if (!rawPayload) {
      console.warn('[SERVER] Received interaction with no payload');
      return;
    }
    payload = JSON.parse(rawPayload as string);
  } catch (err) {
    console.error('[SERVER] Failed to parse Slack payload:', err);
    return;
  }

  if (payload.type !== 'block_actions') {
    console.log(`[SERVER] Ignoring non-block_actions payload type: ${payload.type}`);
    return;
  }

  const actions = payload.actions ?? [];
  if (actions.length === 0) {
    console.log('[SERVER] No actions in payload');
    return;
  }

  const jira = new JiraClient();

  for (const action of actions) {
    const { action_id, value } = action;

    if (!value) {
      console.warn(`[SERVER] Action ${action_id} has no value`);
      continue;
    }

    let buttonPayload: SlackButtonPayload;
    try {
      buttonPayload = JSON.parse(value) as SlackButtonPayload;
    } catch (err) {
      console.error(`[SERVER] Failed to parse button value for ${action_id}:`, err);
      continue;
    }

    const { messageId, ticketKey, action: buttonAction } = buttonPayload;

    console.log(`[SERVER] Handling action=${buttonAction} messageId=${messageId} ticket=${ticketKey}`);

    let state = loadWontDoState();
    const message = findMessageById(state, messageId);

    if (!message) {
      console.warn(`[SERVER] Message ${messageId} not found in state`);
      continue;
    }

    if (buttonAction === 'approve') {
      // Move this specific ticket to Won't Do in Jira
      try {
        await moveToWontDo(jira, ticketKey);
        console.log(`[SERVER] Moved ${ticketKey} to Won't Do in Jira`);
      } catch (err) {
        console.error(`[SERVER] Failed to transition ${ticketKey} to Won't Do: ${err}`);
        // Still resolve it in state so we don't loop
      }

      state = resolveTicketInMessage(state, messageId, ticketKey, 'approved');
      saveWontDoState(state);

      // ── Record in resurfacing state so this ticket can be monitored ──────
      const approvedPendingTicket = message.tickets.find((t) => t.ticketKey === ticketKey);
      if (approvedPendingTicket) {
        // Fetch the team so that the resurfacing record can route back to the
        // correct squad lead even after the ticket leaves Parking Lot.
        let approvedTeam = '';
        try {
          const fullTicket = await jira.getIssue(ticketKey, [config.jira.teamFieldId]);
          approvedTeam = deriveTeamFromTicket(fullTicket) ?? '';
        } catch (err) {
          console.warn(`[SERVER] Could not fetch team for ${ticketKey} resurfacing record: ${err}`);
        }

        let resurfacingState = loadResurfacingState();
        resurfacingState = recordWontDoByKey(
          resurfacingState,
          ticketKey,
          approvedPendingTicket.summary,
          null,
          approvedTeam
        );
        saveResurfacingState(resurfacingState);
        console.log(`[SERVER] Recorded ${ticketKey} (team=${approvedTeam || 'unknown'}) in resurfacing state`);
      }

      console.log(`[SERVER] Ticket ${ticketKey} resolved as 'approved' in message ${messageId}`);

    } else if (buttonAction === 'skip') {
      // Leave ticket in Parking Lot — no Jira update
      state = resolveTicketInMessage(state, messageId, ticketKey, 'skipped');
      saveWontDoState(state);

      console.log(`[SERVER] Ticket ${ticketKey} resolved as 'skipped' in message ${messageId} (stays in Parking Lot)`);

    } else if (buttonAction === 'approve_all') {
      // Move ALL unresolved tickets in this message to Won't Do
      const unresolvedTickets = message.tickets.filter((t) => !t.resolved);

      let resurfacingState = loadResurfacingState();

      for (const ticket of unresolvedTickets) {
        try {
          await moveToWontDo(jira, ticket.ticketKey);
          console.log(`[SERVER] Moved ${ticket.ticketKey} to Won't Do in Jira (approve all)`);
        } catch (err) {
          console.error(`[SERVER] Failed to transition ${ticket.ticketKey} to Won't Do: ${err}`);
        }

        // Record each approved ticket in resurfacing state.
        // Fetch the team so that the resurfacing record can route back to the
        // correct squad lead even after the ticket leaves Parking Lot.
        let approveAllTeam = '';
        try {
          const fullTicket = await jira.getIssue(ticket.ticketKey, [config.jira.teamFieldId]);
          approveAllTeam = deriveTeamFromTicket(fullTicket) ?? '';
        } catch (err) {
          console.warn(`[SERVER] Could not fetch team for ${ticket.ticketKey} resurfacing record: ${err}`);
        }

        resurfacingState = recordWontDoByKey(
          resurfacingState,
          ticket.ticketKey,
          ticket.summary,
          null,
          approveAllTeam
        );
      }

      saveResurfacingState(resurfacingState);
      console.log(`[SERVER] Recorded ${unresolvedTickets.length} ticket(s) in resurfacing state (approve all)`);

      state = resolveAllTicketsInMessage(state, messageId, 'approved');
      saveWontDoState(state);

      console.log(`[SERVER] All tickets in message ${messageId} resolved as 'approved'`);

    } else {
      console.warn(`[SERVER] Unknown button action: ${buttonAction}`);
    }
  }
});

/**
 * Discover and apply the "Won't Do" transition for a Jira ticket.
 * Looks for a transition whose name matches "Won't Do" (case-insensitive).
 */
async function moveToWontDo(jira: JiraClient, issueKey: string): Promise<void> {
  const transitionId = await jira.findTransitionId(issueKey, "Won't Do");

  if (!transitionId) {
    // Try alternative names
    const transitions = await jira.getTransitions(issueKey);
    const names = transitions.map((t) => t.name);
    throw new Error(
      `No "Won't Do" transition found for ${issueKey}. ` +
      `Available transitions: ${names.join(', ')}`
    );
  }

  await jira.transitionIssue(issueKey, transitionId);
}

/**
 * Weekly Bug Digest manual trigger endpoint.
 * Accepts POST /trigger/weekly-digest to run the digest immediately.
 * Responds immediately with 202 (or 429 if already running) and runs async.
 */
app.post('/trigger/weekly-digest', (_req: Request, res: Response) => {
  if (!acquireLock('weekly')) {
    console.warn('[SERVER] Weekly digest already running — rejecting duplicate trigger (429)');
    res.status(429).json({ error: 'Job already running' });
    return;
  }

  console.log('[SERVER] Manual trigger received for weekly bug digest');
  res.status(202).json({
    status: 'triggered',
    message: 'Weekly bug digest triggered — results will appear in Slack shortly',
  });

  // Run asynchronously — do not block the HTTP response
  runWeeklyBugDigest()
    .catch((err) => {
      const ts = new Date().toISOString();
      console.error(`[SERVER] ${ts} — Weekly digest trigger failed: ${err}`);
    })
    .finally(() => releaseLock('weekly'));
});

/**
 * Monthly Feature Digest manual trigger endpoint.
 * Accepts POST /trigger/monthly-digest to run the digest immediately.
 * Responds immediately with 202 (or 429 if already running) and runs async.
 */
app.post('/trigger/monthly-digest', (_req: Request, res: Response) => {
  if (!acquireLock('monthly')) {
    console.warn('[SERVER] Monthly digest already running — rejecting duplicate trigger (429)');
    res.status(429).json({ error: 'Job already running' });
    return;
  }

  console.log('[SERVER] Manual trigger received for monthly feature digest');
  res.status(202).json({
    status: 'triggered',
    message: 'Monthly feature digest triggered — results will appear in Slack shortly',
  });

  // Run asynchronously — do not block the HTTP response
  runMonthlyFeatureDigest()
    .catch((err) => {
      const ts = new Date().toISOString();
      console.error(`[SERVER] ${ts} — Monthly digest trigger failed: ${err}`);
    })
    .finally(() => releaseLock('monthly'));
});

/**
 * Quarterly Adoption Check manual trigger endpoint.
 * Accepts POST /trigger/adoption-check to run the adoption query immediately.
 * Responds immediately with 202 (or 429 if already running) and runs async.
 */
app.post('/trigger/adoption-check', (_req: Request, res: Response) => {
  if (!acquireLock('quarterly')) {
    console.warn('[SERVER] Quarterly adoption check already running — rejecting duplicate trigger (429)');
    res.status(429).json({ error: 'Job already running' });
    return;
  }

  console.log('[SERVER] Manual trigger received for quarterly adoption check');
  res.status(202).json({
    status: 'triggered',
    message: 'Quarterly adoption check triggered — check server logs for results',
  });

  runAdoptionCheck()
    .catch((err) => {
      const ts = new Date().toISOString();
      console.error(`[SERVER] ${ts} — Quarterly adoption check failed: ${err}`);
    })
    .finally(() => releaseLock('quarterly'));
});

const port = config.serverPort;

const server = app.listen(port, () => {
  console.log(`[SERVER] Slack interaction server listening on port ${port}`);
  console.log(`[SERVER] POST /slack/interactions`);
  console.log(`[SERVER] POST /trigger/weekly-digest`);
  console.log(`[SERVER] POST /trigger/monthly-digest`);
  console.log(`[SERVER] POST /trigger/adoption-check`);
  console.log(`[SERVER] GET  /health`);
});

// ── Weekly Bug Digest Cron Job ─────────────────────────────────────────────────
// Runs in the same process as the interaction server to share the port.
const { cronExpression, timezone } = config.weeklyDigest;

if (cron.validate(cronExpression)) {
  console.log(
    `[CRON] Scheduling weekly bug digest: "${cronExpression}" (timezone: ${timezone})`
  );

  cron.schedule(
    cronExpression,
    async () => {
      const ts = new Date().toISOString();
      console.log(`[CRON] Weekly bug digest fired at ${ts}`);

      if (!acquireLock('weekly')) {
        console.warn(`[CRON] ${ts} — Weekly digest still running from previous cron fire — skipping this run.`);
        return;
      }

      try {
        await runWeeklyBugDigest();
      } catch (err) {
        const failTs = new Date().toISOString();
        console.error(`[CRON] ${failTs} — Weekly digest run failed: ${err}`);
      } finally {
        releaseLock('weekly');
      }
    },
    { timezone }
  );

  console.log('[CRON] Weekly bug digest scheduled — Monday 8:00 AM (within 5-minute window).');
} else {
  console.error(
    `[CRON] Invalid cron expression "${cronExpression}". Weekly digest will not be scheduled.`
  );
}

// ── Monthly Feature Digest Cron Job ───────────────────────────────────────────
// Fires on the first Monday of each month (days 1-7 that are also Monday) at 8:00 AM.
// Cron expression: 0 8 1-7 * 1
// The MONTHLY_DIGEST_CRON env var can override this for testing.
const monthlyDigestCronExpression =
  process.env['MONTHLY_DIGEST_CRON'] ?? '0 8 1-7 * 1';

if (cron.validate(monthlyDigestCronExpression)) {
  console.log(
    `[CRON] Scheduling monthly feature digest: "${monthlyDigestCronExpression}" (timezone: ${timezone})`
  );

  cron.schedule(
    monthlyDigestCronExpression,
    async () => {
      const ts = new Date().toISOString();
      console.log(`[CRON] Monthly feature digest fired at ${ts}`);

      if (!acquireLock('monthly')) {
        console.warn(`[CRON] ${ts} — Monthly digest still running from previous cron fire — skipping this run.`);
        return;
      }

      try {
        await runMonthlyFeatureDigest();
      } catch (err) {
        const failTs = new Date().toISOString();
        console.error(`[CRON] ${failTs} — Monthly digest run failed: ${err}`);
      } finally {
        releaseLock('monthly');
      }
    },
    { timezone }
  );

  console.log('[CRON] Monthly feature digest scheduled — first Monday of each month, 8:00 AM.');
} else {
  console.error(
    `[CRON] Invalid monthly digest cron expression "${monthlyDigestCronExpression}". Monthly digest will not be scheduled.`
  );
}

// ── Quarterly Adoption Check Cron Job ─────────────────────────────────────────
// Fires on the first Monday of Jan, Apr, Jul, Oct at 8:00 AM.
// Cron expression: 0 8 1-7 1,4,7,10 1
// The QUARTERLY_ADOPTION_CRON env var can override this for testing.
const quarterlyAdoptionCronExpression =
  process.env['QUARTERLY_ADOPTION_CRON'] ?? '0 8 1-7 1,4,7,10 1';

if (cron.validate(quarterlyAdoptionCronExpression)) {
  console.log(
    `[CRON] Scheduling quarterly adoption check: "${quarterlyAdoptionCronExpression}" (timezone: ${timezone})`
  );

  cron.schedule(
    quarterlyAdoptionCronExpression,
    async () => {
      const ts = new Date().toISOString();
      console.log(`[CRON] Quarterly adoption check fired at ${ts}`);

      if (!acquireLock('quarterly')) {
        console.warn(`[CRON] ${ts} — Quarterly adoption check still running — skipping this run.`);
        return;
      }

      try {
        const result = await runAdoptionCheck();
        console.log(
          `[CRON] Quarterly adoption check complete: ` +
          `${result.adoptedCount} adopted / ${result.totalParents} total parent tickets.`
        );
      } catch (err) {
        const failTs = new Date().toISOString();
        console.error(`[CRON] ${failTs} — Quarterly adoption check failed: ${err}`);
      } finally {
        releaseLock('quarterly');
      }
    },
    { timezone }
  );

  console.log('[CRON] Quarterly adoption check scheduled — first Monday of Jan, Apr, Jul, Oct, 8:00 AM.');
} else {
  console.error(
    `[CRON] Invalid quarterly adoption cron expression "${quarterlyAdoptionCronExpression}". Quarterly adoption check will not be scheduled.`
  );
}

export { app, server };
