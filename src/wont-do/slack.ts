/**
 * Slack Messaging for Won't Do Approval Flow
 *
 * Builds and sends Slack Block Kit messages with:
 * - Per-ticket Approve and Skip buttons
 * - A global Approve All button
 * - Enough payload data in the action_id / value to identify the ticket and message
 *
 * Button payload format (JSON encoded in value field):
 *   { messageId, ticketKey, action }
 *   action: "approve" | "skip" | "approve_all"
 */

import { WebClient } from '@slack/web-api';
import type { KnownBlock, Block } from '@slack/web-api';
import { config } from '../config/index.js';
import type { WontDoCandidate } from './router.js';
import type { PendingTicket } from './state.js';

let _client: WebClient | null = null;

function getSlackClient(): WebClient {
  if (!_client) {
    _client = new WebClient(config.slack.botToken);
  }
  return _client;
}

export interface SlackButtonPayload {
  messageId: string;
  ticketKey: string;
  action: 'approve' | 'skip' | 'approve_all';
}

/**
 * Build Block Kit blocks for a Won't Do approval message.
 * Each ticket gets its own section with Approve + Skip buttons.
 * An Approve All button is appended at the bottom.
 */
function buildBlocks(
  messageId: string,
  candidates: WontDoCandidate[],
  isReminder: boolean = false
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  // Header
  const headerText = isReminder
    ? ':bell: *Reminder: Won\'t Do Approval Required*'
    : ':clipboard: *Won\'t Do Candidates — Approval Required*';

  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: isReminder ? 'Reminder: Won\'t Do Approval Required' : 'Won\'t Do Candidates — Approval Required', emoji: true },
  });

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: headerText + '\n\nThe following tickets have been identified as Won\'t Do candidates. Please review and approve or skip each one.',
    },
  });

  blocks.push({ type: 'divider' });

  // Per-ticket blocks
  for (const candidate of candidates) {
    const { ticket, reason, impactScore } = candidate;
    const jiraUrl = `${config.jira.baseUrl}/browse/${ticket.key}`;

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*<${jiraUrl}|${ticket.key}>* — ${ticket.summary}\n` +
          `> *Reason:* ${reason}\n` +
          `> *Impact Score:* ${impactScore.toFixed(2)}  |  *Team:* ${candidate.teamName}`,
      },
      accessory: undefined,
    });

    const approvePayload: SlackButtonPayload = { messageId, ticketKey: ticket.key, action: 'approve' };
    const skipPayload: SlackButtonPayload = { messageId, ticketKey: ticket.key, action: 'skip' };

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve', emoji: false },
          style: 'primary',
          action_id: `wont_do_approve_${ticket.key}`,
          value: JSON.stringify(approvePayload),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Skip', emoji: false },
          action_id: `wont_do_skip_${ticket.key}`,
          value: JSON.stringify(skipPayload),
        },
      ],
    });

    blocks.push({ type: 'divider' });
  }

  // Global Approve All button
  const approveAllPayload: SlackButtonPayload = {
    messageId,
    ticketKey: '__all__',
    action: 'approve_all',
  };

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Approve All', emoji: false },
        style: 'danger',
        confirm: {
          title: { type: 'plain_text', text: 'Confirm Approve All' },
          text: { type: 'mrkdwn', text: 'Are you sure you want to move *all* listed tickets to Won\'t Do in Jira?' },
          confirm: { type: 'plain_text', text: 'Yes, approve all' },
          deny: { type: 'plain_text', text: 'Cancel' },
        },
        action_id: `wont_do_approve_all`,
        value: JSON.stringify(approveAllPayload),
      },
    ],
  });

  return blocks;
}

/**
 * Build reminder blocks from PendingTickets (tickets that are still unresolved).
 */
function buildReminderBlocks(
  messageId: string,
  unresolvedTickets: PendingTicket[],
  teamName: string,
  isReminder: boolean = true
): KnownBlock[] {
  // Convert PendingTickets back to WontDoCandidate shape for rendering
  const pseudoCandidates = unresolvedTickets.map((t) => ({
    ticket: {
      key: t.ticketKey,
      summary: t.summary,
      description: null,
      id: '',
      labels: [],
      reporter: { accountId: '', displayName: '' },
      created: '',
      issueType: '',
      status: 'Parking Lot',
      priority: null,
      customFields: {},
    },
    teamName,
    reason: t.reason,
    routingType: t.routingType,
    recipientSlackUserId: '',
    impactScore: t.impactScore,
    ruleTriggered: 'low-impact' as const,
  }));

  return buildBlocks(messageId, pseudoCandidates, isReminder);
}

/**
 * Send a Won't Do approval message to Slack.
 * Returns the Slack message timestamp (ts) which is used as the message ID on the Slack side.
 */
export async function sendWontDoApprovalMessage(
  messageId: string,
  candidates: WontDoCandidate[],
  recipientSlackUserId: string,
  isReminder: boolean = false
): Promise<string> {
  const client = getSlackClient();
  const channel = config.slack.channel;

  const blocks = buildBlocks(messageId, candidates, isReminder);

  const reminderLabel = isReminder ? ' (Reminder)' : '';
  const fallbackText = `Won't Do Approval Required${reminderLabel}: ${candidates.map((c) => c.ticket.key).join(', ')}`;

  const result = await client.chat.postMessage({
    channel,
    text: fallbackText,
    blocks,
    mrkdwn: true,
  });

  if (!result.ok || !result.ts) {
    throw new Error(`Slack postMessage failed: ${result.error ?? 'unknown error'}`);
  }

  console.log(
    `[SLACK] ${isReminder ? 'Reminder' : 'Approval'} message sent for messageId=${messageId}, ` +
    `ts=${result.ts}, tickets=${candidates.map((c) => c.ticket.key).join(', ')}`
  );

  return result.ts;
}

/**
 * Send a reminder message for pending unresolved tickets.
 */
export async function sendReminderMessage(
  messageId: string,
  unresolvedTickets: PendingTicket[],
  teamName: string,
  recipientSlackUserId: string
): Promise<string> {
  const client = getSlackClient();
  const channel = config.slack.channel;

  const blocks = buildReminderBlocks(messageId, unresolvedTickets, teamName, true);

  const fallbackText = `Reminder: Won't Do Approval Required: ${unresolvedTickets.map((t) => t.ticketKey).join(', ')}`;

  const result = await client.chat.postMessage({
    channel,
    text: fallbackText,
    blocks,
    mrkdwn: true,
  });

  if (!result.ok || !result.ts) {
    throw new Error(`Slack postMessage failed: ${result.error ?? 'unknown error'}`);
  }

  console.log(
    `[SLACK] Reminder message sent for messageId=${messageId}, ts=${result.ts}`
  );

  return result.ts;
}

/**
 * Update an existing Slack message (e.g., after a button click, to show resolved state).
 */
export async function updateSlackMessage(
  channel: string,
  ts: string,
  text: string,
  blocks?: KnownBlock[]
): Promise<void> {
  const client = getSlackClient();
  await client.chat.update({
    channel,
    ts,
    text,
    blocks,
  });
}
