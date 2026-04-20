/**
 * Sprint 6 — Adoption Tracker
 *
 * Counts how many Product Feedback parent tickets have at least one linked
 * delivery ticket whose status category is "Done" (or whose status name is
 * "Done" or "Completed").
 *
 * Rules:
 *   - Only "Idea" issue-type tickets with at least one issue link are examined.
 *   - Links whose type contains "clone" / "cloner" are treated as internal
 *     grouping links and are skipped.
 *   - A parent ticket with no non-grouping delivery links does NOT count (AC3).
 *   - A parent ticket counts if at least one delivery ticket is Done/Completed.
 *
 * Usage:
 *   import { runAdoptionCheck } from './adoption/tracker.js';
 *   const { adoptedCount, totalParents } = await runAdoptionCheck();
 */

import { JiraClient } from '../jira/client.js';
import { withRetry } from '../utils/retry.js';

export interface AdoptionResult {
  /** Number of parent tickets that have at least one Done delivery ticket */
  adoptedCount: number;
  /** Total number of parent tickets examined */
  totalParents: number;
  /** Parent ticket keys that counted as adopted */
  adoptedKeys: string[];
}

/**
 * Determine whether a delivery ticket is considered "Done" or "Completed".
 *
 * Checks both the status category name ("Done") and the raw status name
 * ("Done", "Completed", "Closed", "Resolved") to handle Jira instances
 * that use custom workflow names.
 */
function isDeliveryTicketDone(ticket: {
  status: string;
  statusCategoryName: string;
  statusCategoryKey: string;
}): boolean {
  // Status category key "done" is the canonical Jira signal
  if (ticket.statusCategoryKey === 'done') return true;

  // Fallback: match common Done-equivalent status names (case-insensitive)
  const statusLower = ticket.status.toLowerCase();
  return (
    statusLower === 'done' ||
    statusLower === 'completed' ||
    statusLower === 'closed' ||
    statusLower === 'resolved'
  );
}

/**
 * Run the quarterly adoption check.
 *
 * Fetches all Product Feedback parent tickets (Idea issue type with links),
 * then for each one checks if any delivery ticket (non-grouping link) is Done.
 *
 * Returns the count of adopted parent tickets, the total examined, and the
 * specific keys that counted as adopted.
 */
export async function runAdoptionCheck(): Promise<AdoptionResult> {
  const jira = new JiraClient();

  console.log('\n=== Adoption Tracker — Quarterly Run ===');
  console.log(`Started at: ${new Date().toISOString()}`);

  // Fetch all parent tickets with links
  console.log('[ADOPTION] Fetching Product Feedback parent tickets...');
  let parentTickets;
  try {
    parentTickets = await withRetry(
      () => jira.fetchProductFeedbackParentTickets(),
      2,
      5000,
      'fetchProductFeedbackParentTickets'
    );
  } catch (err) {
    console.error(`[ADOPTION] Failed to fetch parent tickets: ${err}`);
    throw err;
  }

  console.log(`[ADOPTION] Found ${parentTickets.length} parent ticket(s) with issue links.`);

  const adoptedKeys: string[] = [];

  for (const parent of parentTickets) {
    let deliveryTickets;
    try {
      deliveryTickets = await withRetry(
        () => jira.getLinkedDeliveryTickets(parent.key),
        2,
        5000,
        `getLinkedDeliveryTickets(${parent.key})`
      );
    } catch (err) {
      console.warn(
        `[ADOPTION] Could not fetch delivery tickets for ${parent.key}: ${err} — skipping.`
      );
      continue;
    }

    // AC3: a parent ticket with no delivery links is NOT counted
    if (deliveryTickets.length === 0) {
      console.log(`  ${parent.key}: no delivery links — skipped`);
      continue;
    }

    const hasDoneDeliveryTicket = deliveryTickets.some(isDeliveryTicketDone);

    if (hasDoneDeliveryTicket) {
      adoptedKeys.push(parent.key);
      const doneKeys = deliveryTickets
        .filter(isDeliveryTicketDone)
        .map((t) => `${t.key}(${t.status})`)
        .join(', ');
      console.log(`  ${parent.key}: ADOPTED — done delivery ticket(s): ${doneKeys}`);
    } else {
      const allStatuses = deliveryTickets
        .map((t) => `${t.key}(${t.status})`)
        .join(', ');
      console.log(`  ${parent.key}: not adopted — delivery ticket(s): ${allStatuses}`);
    }
  }

  const result: AdoptionResult = {
    adoptedCount: adoptedKeys.length,
    totalParents: parentTickets.length,
    adoptedKeys,
  };

  console.log(`\n[ADOPTION] Summary:`);
  console.log(`  Total parent tickets examined: ${result.totalParents}`);
  console.log(`  Adopted (at least one Done delivery ticket): ${result.adoptedCount}`);
  console.log('=== Adoption Tracker complete ===\n');

  return result;
}
