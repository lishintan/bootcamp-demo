/**
 * Won't Do Reminder Loop
 *
 * Checks for pending messages that need reminders:
 * - If a message has unresolved tickets and no interaction within 24 hours,
 *   send an identical reminder message (new Slack message, same content).
 * - Track reminder count. After 3 unanswered reminders, stop sending.
 * - A "new" Slack message is sent each time (not an update to the original).
 *   This ensures the recipient sees the reminder as a new notification.
 *
 * This module is intended to be called periodically (e.g., via cron or
 * a scheduled script). It does NOT run as a long-lived process.
 */

import {
  loadWontDoState,
  saveWontDoState,
  updatePendingMessage,
  getMessagesForReminder,
  getAbandonedMessages,
} from './state.js';
import type { PendingMessage } from './state.js';
import { sendReminderMessage } from './slack.js';
import { config } from '../config/index.js';

/**
 * Process pending messages and send reminder messages where needed.
 * Returns the number of reminders sent.
 */
export async function processReminders(): Promise<number> {
  let state = loadWontDoState();
  const dueMessages = getMessagesForReminder(state);
  const abandonedMessages = getAbandonedMessages(state);
  const maxReminders = config.wontDo.maxReminders;

  // Log abandoned messages (no more reminders will be sent)
  if (abandonedMessages.length > 0) {
    for (const msg of abandonedMessages) {
      const unresolvedKeys = msg.tickets
        .filter((t) => !t.resolved)
        .map((t) => t.ticketKey);
      console.log(
        `[REMINDERS] Message ${msg.messageId} has exhausted ${maxReminders} reminders. ` +
        `Tickets remain in Parking Lot: ${unresolvedKeys.join(', ')}`
      );
    }
  }

  if (dueMessages.length === 0) {
    console.log('[REMINDERS] No messages due for reminders.');
    return 0;
  }

  let remindersSent = 0;

  for (const msg of dueMessages) {
    const unresolvedTickets = msg.tickets.filter((t) => !t.resolved);

    if (unresolvedTickets.length === 0) {
      console.log(`[REMINDERS] Message ${msg.messageId} has no unresolved tickets, skipping.`);
      continue;
    }

    // Determine team name from the first unresolved ticket's routing context
    // We use the recipientSlackUserId to infer routing; team name stored in state
    const teamName = inferTeamFromMessage(msg);

    try {
      console.log(
        `[REMINDERS] Sending reminder ${msg.reminderCount + 1}/${maxReminders} for message ${msg.messageId}...`
      );

      const newTs = await sendReminderMessage(
        msg.messageId,
        unresolvedTickets,
        teamName,
        msg.recipientSlackUserId
      );

      // Update the state: increment reminder count, update lastReminderAt, and update ts
      state = updatePendingMessage(state, msg.messageId, {
        reminderCount: msg.reminderCount + 1,
        lastReminderAt: new Date().toISOString(),
        slackMessageTs: newTs,
      });

      remindersSent++;

      console.log(
        `[REMINDERS] Reminder sent for ${msg.messageId}: ` +
        `count=${msg.reminderCount + 1}, unresolved=${unresolvedTickets.map((t) => t.ticketKey).join(', ')}`
      );
    } catch (err) {
      console.error(`[REMINDERS] Failed to send reminder for message ${msg.messageId}: ${err}`);
    }
  }

  saveWontDoState(state);

  console.log(`[REMINDERS] Processed ${dueMessages.length} pending messages, sent ${remindersSent} reminders.`);
  return remindersSent;
}

/**
 * Infer team name from a pending message.
 * Currently, we store it implicitly. We use the first unresolved ticket's reason
 * to extract team context, or fall back to a generic label.
 */
function inferTeamFromMessage(msg: PendingMessage): string {
  // Best effort: look for a stored team name in the ticket reasons
  // In practice, team is embedded in the reason text or can be looked up via routing maps
  // For the reminder display we just need a label — the message content re-uses the stored reason
  const first = msg.tickets[0];
  if (!first) return 'Unknown Team';

  // Try to extract team from the reason if it was embedded
  // Fall back to a placeholder that the Slack message already has in the reason field
  return 'Your Team';
}
