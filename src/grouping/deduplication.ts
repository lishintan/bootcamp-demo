import type { JiraTicket } from '../jira/client.js';

/**
 * Deduplication by unique user + unique issue.
 *
 * AC #4: If the same user submits multiple tickets about the identical problem,
 * the resulting group counts that user as 1 unique signal, not multiple.
 *
 * A "unique signal" is the combination of (reporterAccountId, canonicalGroupId).
 * This module provides utilities to count unique signals per group.
 */

export interface DeduplicatedGroup {
  groupId: string; // key of the parent ticket
  parentKey: string;
  childKeys: string[];
  /** Unique reporter account IDs in this group */
  uniqueReporterIds: Set<string>;
  /** Number of unique user signals */
  uniqueSignalCount: number;
}

/**
 * Given a parent ticket and its children, compute deduplicated signal count.
 */
export function computeDeduplicatedSignals(
  parent: JiraTicket,
  children: JiraTicket[]
): DeduplicatedGroup {
  const allTickets = [parent, ...children];
  const uniqueReporterIds = new Set<string>(
    allTickets.map((t) => t.reporter.accountId)
  );

  return {
    groupId: parent.key,
    parentKey: parent.key,
    childKeys: children.map((c) => c.key),
    uniqueReporterIds,
    uniqueSignalCount: uniqueReporterIds.size,
  };
}
