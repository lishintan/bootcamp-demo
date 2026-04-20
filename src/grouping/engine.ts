import type { JiraTicket } from '../jira/client.js';
import { JiraClient } from '../jira/client.js';
import { computeGroupSimilarity } from '../similarity/index.js';
import { isSecurityOrComplianceTicket } from './security.js';
import { config } from '../config/index.js';

export interface TicketGroup {
  parent: JiraTicket;
  children: JiraTicket[];
  /** Members = parent + children, ordered by creation date ascending */
  members: JiraTicket[];
}

export interface GroupingResult {
  groups: TicketGroup[];
  standaloneTickets: JiraTicket[];
  securitySkipped: JiraTicket[];
  newLinksCreated: number;
  groupsCreated: number;
  groupsUpdated: number;
}

/**
 * The main grouping engine.
 *
 * Algorithm:
 * 1. Sort tickets by creation date ascending (oldest first → becomes parent)
 * 2. For each ticket:
 *    a. Skip if it's a security/compliance ticket (AC #5)
 *    b. Compare against all existing groups using Claude semantic similarity
 *    c. If similarity ≥ threshold → add as child to best matching group, create Jira link
 *    d. Otherwise → start a new group with this ticket as parent
 *
 * Decision on ambiguity (AC #3): "Clearly unrelated" means similarity < threshold.
 * A ticket below threshold is left standalone (or starts its own group).
 */
export class GroupingEngine {
  private jira: JiraClient;
  private threshold: number;
  private linkTypeName: string;

  constructor(jira: JiraClient, linkTypeName: string = 'Cloners') {
    this.jira = jira;
    this.threshold = config.similarityThreshold;
    this.linkTypeName = linkTypeName;
  }

  async run(tickets: JiraTicket[]): Promise<GroupingResult> {
    // Sort by creation date ascending so earliest ticket becomes parent
    const sorted = [...tickets].sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
    );

    const groups: TicketGroup[] = [];
    const standaloneTickets: JiraTicket[] = [];
    const securitySkipped: JiraTicket[] = [];
    let newLinksCreated = 0;
    let groupsCreated = 0;
    const updatedGroupKeys = new Set<string>();

    for (const ticket of sorted) {
      // AC #5: Skip security/compliance tickets
      if (isSecurityOrComplianceTicket(ticket.labels, ticket.description)) {
        console.log(`[SKIP] ${ticket.key} — security/compliance keyword detected`);
        securitySkipped.push(ticket);
        continue;
      }

      if (groups.length === 0) {
        // First non-security ticket → starts a new group
        groups.push({ parent: ticket, children: [], members: [ticket] });
        groupsCreated++;
        console.log(`[NEW GROUP] ${ticket.key} → parent of new group`);
        continue;
      }

      // Find the best matching group
      let bestGroup: TicketGroup | null = null;
      let bestScore = 0;

      for (const group of groups) {
        const score = await computeGroupSimilarity(ticket, group.members);
        if (score >= this.threshold && score > bestScore) {
          bestScore = score;
          bestGroup = group;
        }
      }

      if (bestGroup) {
        // AC #2: Add ticket as child to best matching group
        console.log(
          `[MATCH] ${ticket.key} → child of ${bestGroup.parent.key} (score: ${bestScore.toFixed(3)})`
        );
        bestGroup.children.push(ticket);
        bestGroup.members.push(ticket);
        updatedGroupKeys.add(bestGroup.parent.key);

        // Create Jira parent-child link
        try {
          await this.createLinkIfNotExists(bestGroup.parent.key, ticket.key);
          newLinksCreated++;
        } catch (err) {
          console.error(
            `[ERROR] Failed to create link ${bestGroup.parent.key} → ${ticket.key}:`,
            err
          );
        }
      } else {
        // AC #3: No match → standalone or new group
        console.log(
          `[NO MATCH] ${ticket.key} → standalone (best score: ${bestScore.toFixed(3)})`
        );
        // The ticket starts its own group (it may attract future tickets)
        groups.push({ parent: ticket, children: [], members: [ticket] });
        groupsCreated++;
      }
    }

    // Tickets that form singleton groups are standalone
    for (const group of groups) {
      if (group.children.length === 0) {
        standaloneTickets.push(group.parent);
      }
    }

    return {
      groups: groups.filter((g) => g.children.length > 0),
      standaloneTickets,
      securitySkipped,
      newLinksCreated,
      groupsCreated,
      groupsUpdated: updatedGroupKeys.size,
    };
  }

  /**
   * Create a parent-child link only if it doesn't already exist.
   * This ensures idempotency so re-running doesn't create duplicate links.
   */
  private async createLinkIfNotExists(
    parentKey: string,
    childKey: string
  ): Promise<void> {
    const existingLinks = await this.jira.getIssueLinks(parentKey);

    const alreadyLinked = existingLinks.some((link) => {
      const outward = link.outwardIssue?.key;
      const inward = link.inwardIssue?.key;
      return outward === childKey || inward === childKey;
    });

    if (alreadyLinked) {
      console.log(`[SKIP LINK] ${parentKey} → ${childKey} already exists`);
      return;
    }

    await this.jira.createParentChildLink(parentKey, childKey, this.linkTypeName);
  }
}
