/**
 * Won't Do State Manager
 *
 * Persists pending approval requests and reminder counts to a JSON file.
 * No database required — file-based state is sufficient for this use case.
 *
 * Schema:
 * {
 *   "pendingMessages": [
 *     {
 *       "messageId": "unique-uuid",
 *       "slackMessageTs": "Slack message timestamp (used as message ID)",
 *       "channel": "#channel",
 *       "recipientSlackUserId": "U12345",
 *       "sentAt": "ISO-8601",
 *       "reminderCount": 0,
 *       "lastReminderAt": "ISO-8601 | null",
 *       "tickets": [
 *         {
 *           "ticketKey": "PF-123",
 *           "summary": "...",
 *           "reason": "Insufficient information to action.",
 *           "routingType": "product-ops" | "squad-lead",
 *           "impactScore": 1.5,
 *           "resolved": false,
 *           "resolution": "approved" | "skipped" | null
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/index.js';

export type RoutingType = 'product-ops' | 'squad-lead';
export type Resolution = 'approved' | 'skipped';

export interface PendingTicket {
  ticketKey: string;
  summary: string;
  reason: string;
  routingType: RoutingType;
  impactScore: number;
  resolved: boolean;
  resolution: Resolution | null;
}

export interface PendingMessage {
  /** UUID for this message batch */
  messageId: string;
  /** Slack message timestamp (ts field) */
  slackMessageTs: string;
  /** Slack channel the message was sent to */
  channel: string;
  /** Slack user ID of the recipient */
  recipientSlackUserId: string;
  /** ISO-8601 timestamp when the message was first sent */
  sentAt: string;
  /** Number of reminder messages sent so far */
  reminderCount: number;
  /** ISO-8601 timestamp of the last reminder, or null */
  lastReminderAt: string | null;
  /** All tickets in this message batch */
  tickets: PendingTicket[];
}

export interface WontDoState {
  pendingMessages: PendingMessage[];
}

const DEFAULT_STATE: WontDoState = {
  pendingMessages: [],
};

function getStatePath(): string {
  return config.wontDo.statePath;
}

export function loadWontDoState(): WontDoState {
  const statePath = getStatePath();

  if (!fs.existsSync(statePath)) {
    return { ...DEFAULT_STATE, pendingMessages: [] };
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(raw) as WontDoState;
  } catch (err) {
    console.warn(`[WONT-DO STATE] Could not parse state file, starting fresh: ${err}`);
    return { ...DEFAULT_STATE, pendingMessages: [] };
  }
}

export function saveWontDoState(state: WontDoState): void {
  const statePath = getStatePath();
  const dir = path.dirname(statePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

export function addPendingMessage(
  state: WontDoState,
  message: PendingMessage
): WontDoState {
  return {
    ...state,
    pendingMessages: [...state.pendingMessages, message],
  };
}

export function updatePendingMessage(
  state: WontDoState,
  messageId: string,
  updates: Partial<PendingMessage>
): WontDoState {
  return {
    ...state,
    pendingMessages: state.pendingMessages.map((m) =>
      m.messageId === messageId ? { ...m, ...updates } : m
    ),
  };
}

export function resolveTicketInMessage(
  state: WontDoState,
  messageId: string,
  ticketKey: string,
  resolution: Resolution
): WontDoState {
  return {
    ...state,
    pendingMessages: state.pendingMessages.map((m) => {
      if (m.messageId !== messageId) return m;
      return {
        ...m,
        tickets: m.tickets.map((t) =>
          t.ticketKey === ticketKey
            ? { ...t, resolved: true, resolution }
            : t
        ),
      };
    }),
  };
}

export function resolveAllTicketsInMessage(
  state: WontDoState,
  messageId: string,
  resolution: Resolution
): WontDoState {
  return {
    ...state,
    pendingMessages: state.pendingMessages.map((m) => {
      if (m.messageId !== messageId) return m;
      return {
        ...m,
        tickets: m.tickets.map((t) => ({ ...t, resolved: true, resolution })),
      };
    }),
  };
}

/**
 * Get all pending messages that have NOT been fully resolved and
 * are due for a reminder (last activity was > reminderIntervalHours ago).
 */
export function getMessagesForReminder(state: WontDoState): PendingMessage[] {
  const now = Date.now();
  const intervalMs = config.wontDo.reminderIntervalHours * 60 * 60 * 1000;
  const maxReminders = config.wontDo.maxReminders;

  return state.pendingMessages.filter((m) => {
    // Already fully resolved — all tickets resolved
    const allResolved = m.tickets.every((t) => t.resolved);
    if (allResolved) return false;

    // Already exhausted reminders
    if (m.reminderCount >= maxReminders) return false;

    // Determine reference time (last reminder or original send time)
    const referenceTime = m.lastReminderAt
      ? new Date(m.lastReminderAt).getTime()
      : new Date(m.sentAt).getTime();

    return now - referenceTime >= intervalMs;
  });
}

/**
 * Get all messages with exhausted reminders (no more messages should be sent).
 */
export function getAbandonedMessages(state: WontDoState): PendingMessage[] {
  return state.pendingMessages.filter((m) => {
    const allResolved = m.tickets.every((t) => t.resolved);
    return !allResolved && m.reminderCount >= config.wontDo.maxReminders;
  });
}

export function findMessageById(state: WontDoState, messageId: string): PendingMessage | undefined {
  return state.pendingMessages.find((m) => m.messageId === messageId);
}
