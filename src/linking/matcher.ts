/**
 * Cross-Project Linker — Semantic Matcher
 *
 * Matches Product Feedback ticket groups against work items in the five team
 * delivery projects (Engage, Transform, AI & Innovation, Academy, Identity & Payments).
 *
 * For each group:
 * 1. Fetch all open work items in the delivery project
 * 2. Compute semantic similarity between the group (parent + children) and each work item
 * 3. If similarity >= threshold, create a bidirectional Jira link (idempotent)
 * 4. Record the best match or mark as "Not linked to any delivery work item"
 */

import { JiraClient } from '../jira/client.js';
import type { JiraTicket } from '../jira/client.js';
import type { TicketGroup } from '../grouping/engine.js';
import { computeSimilarity, ticketToText } from '../similarity/index.js';
import { config } from '../config/index.js';

export interface MatchedWorkItem {
  /** The delivery team name */
  teamName: string;
  /** The delivery project key */
  projectKey: string;
  /** The matched work item */
  workItem: JiraTicket;
  /** Similarity score between the group and the matched work item */
  similarityScore: number;
  /** Whether a new Jira link was created (false if it already existed) */
  linkCreated: boolean;
}

export interface GroupLinkResult {
  /** Key of the Product Feedback parent ticket */
  groupParentKey: string;
  /**
   * Matches found across all team delivery projects.
   * Empty array means no match was found in any project.
   */
  matches: MatchedWorkItem[];
  /**
   * Human-readable message when no match is found.
   * Populated only when matches is empty.
   */
  noMatchMessage: string | null;
  /**
   * Priority-bump recommendation. Populated when:
   * - The group has at least one match
   * - The group's Impact Score exceeds the configured threshold
   * - The matched work item's priority is below the configured level
   */
  priorityBumpRecommendation: PriorityBumpRecommendation | null;
}

export interface PriorityBumpRecommendation {
  /** The delivery team name */
  teamName: string;
  /** Direct URL to the matched work item */
  workItemUrl: string;
  /** The matched work item's current priority */
  currentPriority: string | null;
  /** Explanation text */
  message: string;
}

/**
 * Given a group and a set of candidate delivery tickets, find the best matching
 * delivery ticket using semantic similarity.
 *
 * Returns null if no candidate exceeds the similarity threshold.
 */
export async function findBestMatch(
  group: TicketGroup,
  deliveryTickets: JiraTicket[],
  threshold: number
): Promise<{ ticket: JiraTicket; score: number } | null> {
  // Represent the group as the concatenation of parent + up to 3 children summaries
  // This gives a richer signal than just the parent alone.
  const groupRepresentatives = [group.parent, ...group.children.slice(0, 3)];
  const groupText = groupRepresentatives
    .map((t) => ticketToText(t))
    .join('\n\n---\n\n');

  let bestTicket: JiraTicket | null = null;
  let bestScore = 0;

  for (const deliveryTicket of deliveryTickets) {
    const deliveryText = ticketToText(deliveryTicket);
    const score = await computeSimilarity(groupText, deliveryText);

    if (score > bestScore) {
      bestScore = score;
      bestTicket = deliveryTicket;
    }

    // Early exit if we have a very strong match
    if (bestScore >= 0.95) {
      break;
    }
  }

  if (bestTicket && bestScore >= threshold) {
    return { ticket: bestTicket, score: bestScore };
  }

  return null;
}

/**
 * Cross-project linker for a single group across all five team delivery projects.
 *
 * Steps:
 * 1. For each delivery team project, fetch open work items
 * 2. Find the best semantic match
 * 3. Create bidirectional link if match found and link doesn't already exist
 * 4. Surface priority-bump recommendation if applicable
 */
export async function linkGroupToDeliveryProjects(
  group: TicketGroup,
  jira: JiraClient,
  impactScore: number,
  linkTypeName: string = 'Relates'
): Promise<GroupLinkResult> {
  const { teamProjectKeys } = config.jira;
  const threshold = config.similarityThreshold;
  const { priorityBumpThreshold, bumpBelowPriorities } = config.impactScore;
  const { baseUrl } = config.jira;

  const matches: MatchedWorkItem[] = [];

  for (const [teamName, projectKey] of Object.entries(teamProjectKeys)) {
    console.log(
      `[LINKER] Matching group ${group.parent.key} against ${teamName} (${projectKey})...`
    );

    let deliveryTickets: JiraTicket[];
    try {
      deliveryTickets = await jira.getDeliveryProjectTickets(projectKey);
    } catch (err) {
      console.warn(
        `[LINKER] Could not fetch tickets for project ${projectKey}: ${err}`
      );
      continue;
    }

    if (deliveryTickets.length === 0) {
      console.log(`[LINKER] No open tickets found in project ${projectKey}`);
      continue;
    }

    const match = await findBestMatch(group, deliveryTickets, threshold);

    if (!match) {
      console.log(
        `[LINKER] No match for group ${group.parent.key} in project ${projectKey}`
      );
      continue;
    }

    console.log(
      `[LINKER] Match found: ${group.parent.key} ↔ ${match.ticket.key} ` +
        `(score: ${match.score.toFixed(3)}, team: ${teamName})`
    );

    // Create bidirectional link (idempotent)
    let linkCreated = false;
    try {
      const alreadyLinked = await jira.linkExists(
        group.parent.key,
        match.ticket.key
      );
      if (alreadyLinked) {
        console.log(
          `[LINKER] Link ${group.parent.key} ↔ ${match.ticket.key} already exists, skipping`
        );
      } else {
        await jira.createBidirectionalLink(
          group.parent.key,
          match.ticket.key,
          linkTypeName
        );
        linkCreated = true;
        console.log(
          `[LINKER] Bidirectional link created: ${group.parent.key} ↔ ${match.ticket.key}`
        );
      }
    } catch (err) {
      console.error(
        `[LINKER] Failed to create link ${group.parent.key} ↔ ${match.ticket.key}: ${err}`
      );
    }

    matches.push({
      teamName,
      projectKey,
      workItem: match.ticket,
      similarityScore: match.score,
      linkCreated,
    });
  }

  // Build result
  const noMatchMessage =
    matches.length === 0
      ? 'Not linked to any delivery work item'
      : null;

  // Determine priority-bump recommendation
  let priorityBumpRecommendation: PriorityBumpRecommendation | null = null;

  if (
    matches.length > 0 &&
    impactScore > priorityBumpThreshold
  ) {
    // Check the best match (highest similarity score)
    const bestMatch = matches.reduce((a, b) =>
      a.similarityScore >= b.similarityScore ? a : b
    );

    const workItemPriority = bestMatch.workItem.priority ?? 'None';
    const isBelowThreshold =
      workItemPriority === 'None' ||
      bumpBelowPriorities.some(
        (p) => p.toLowerCase() === workItemPriority.toLowerCase()
      );

    if (isBelowThreshold) {
      const workItemUrl = `${baseUrl}/browse/${bestMatch.workItem.key}`;
      priorityBumpRecommendation = {
        teamName: bestMatch.teamName,
        workItemUrl,
        currentPriority: bestMatch.workItem.priority,
        message:
          `Group ${group.parent.key} has an Impact Score of ${impactScore.toFixed(2)}, ` +
          `which exceeds the threshold of ${priorityBumpThreshold}. ` +
          `The matched work item ${bestMatch.workItem.key} (${bestMatch.teamName}) ` +
          `currently has priority "${workItemPriority}". ` +
          `Consider raising its priority. View: ${workItemUrl}`,
      };

      console.log(
        `[LINKER] Priority-bump recommendation for ${group.parent.key}: ` +
          `work item ${bestMatch.workItem.key} priority "${workItemPriority}" ` +
          `may need to be raised (Impact Score: ${impactScore.toFixed(2)})`
      );
    }
  }

  return {
    groupParentKey: group.parent.key,
    matches,
    noMatchMessage,
    priorityBumpRecommendation,
  };
}
