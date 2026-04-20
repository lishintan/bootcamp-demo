/**
 * Won't Do Candidate Router
 *
 * Applies three identification rules to Parking Lot tickets and produces
 * a list of Won't Do candidates with routing information.
 *
 * Rules:
 * 1. Insufficient description → route to Product Ops for the team
 * 2. Sprint-locked delivery item → route to Squad Lead with linked ticket ID
 * 3. Low impact score → route to Squad Lead with score and justification
 *
 * Product Ops routing:
 *   Darshini Mohanadass → Academy, Engage
 *   Bryan Swee           → Identity & Payments
 *   Jin Choy Chew        → AI & Innovation, Transform
 *
 * Squad Lead routing:
 *   Sambruce Joseph     → Transform
 *   Palak Varma         → Engage
 *   Natasha Tomkinson   → Identity & Payments
 *   Amanda Shin         → Academy
 *   Suresh Sakadivan    → AI & Innovation
 */

import { JiraClient } from '../jira/client.js';
import type { JiraTicket } from '../jira/client.js';
import { config } from '../config/index.js';
import type { ScoredGroup } from '../linking/scorer.js';
import type { RoutingType } from './state.js';

export interface WontDoCandidate {
  ticket: JiraTicket;
  teamName: string;
  reason: string;
  routingType: RoutingType;
  recipientSlackUserId: string;
  impactScore: number;
  ruleTriggered: 'insufficient-description' | 'sprint-locked' | 'low-impact';
}

/**
 * Insufficient description — description is null, < 20 characters,
 * or a useless filler string.
 */
const USELESS_DESCRIPTIONS = new Set([
  'no description',
  'n/a',
  'na',
  'none',
  'tbd',
  'to be determined',
  '-',
  '.',
  'test',
]);

function isInsufficientDescription(description: string | null): boolean {
  if (!description) return true;
  const trimmed = description.trim();
  if (trimmed.length < 20) return true;
  if (USELESS_DESCRIPTIONS.has(trimmed.toLowerCase())) return true;
  return false;
}

/**
 * Product Ops team mapping.
 * Returns the Slack user ID for the Product Ops member responsible for the team.
 */
function getProductOpsSlackUserId(teamName: string): string {
  const { productOps } = config.slack;
  const lc = teamName.toLowerCase();

  if (lc.includes('academy') || lc.includes('engage')) {
    return productOps.darshini;
  }
  if (lc.includes('identity') || lc.includes('payment')) {
    return productOps.bryan;
  }
  if (lc.includes('ai') || lc.includes('innovation') || lc.includes('transform')) {
    return productOps.jinChoy;
  }
  // Default fallback
  return productOps.darshini;
}

/**
 * Squad Lead team mapping.
 * Returns the Slack user ID for the Squad Lead responsible for the team.
 */
function getSquadLeadSlackUserId(teamName: string): string {
  const { squadLeads } = config.slack;
  const lc = teamName.toLowerCase();

  if (lc.includes('transform')) return squadLeads.sambruce;
  if (lc.includes('engage')) return squadLeads.palak;
  if (lc.includes('identity') || lc.includes('payment')) return squadLeads.natasha;
  if (lc.includes('academy')) return squadLeads.amanda;
  if (lc.includes('ai') || lc.includes('innovation')) return squadLeads.suresh;
  // Default fallback
  return squadLeads.amanda;
}

/**
 * Check if a delivery work item is sprint-locked:
 * - Status category is "In Progress"
 * - OR it has an active sprint in its `sprint` field (planned for current or next sprint)
 */
async function isSprintLocked(
  deliveryTicketKey: string,
  jira: JiraClient
): Promise<boolean> {
  try {
    const fields = await jira.getIssueRawFields(deliveryTicketKey, [
      'status',
      'sprint',
      'closedSprints',
      'customfield_10020', // sprint field (common Jira Cloud custom field ID)
    ]);

    // Check status category
    const statusField = fields['status'] as { statusCategory?: { key?: string } } | undefined;
    if (statusField?.statusCategory?.key === 'indeterminate') {
      // "In Progress" status category key in Jira
      return true;
    }

    // Also check the raw status name
    const statusName = (statusField as unknown as { name?: string } | undefined)?.name ?? '';
    if (statusName.toLowerCase().includes('in progress')) {
      return true;
    }

    // Check for active sprint — Jira Cloud uses customfield_10020 for sprint
    const sprintRaw = fields['customfield_10020'] ?? fields['sprint'];
    if (sprintRaw) {
      if (Array.isArray(sprintRaw)) {
        // Active sprint has state "active" or "future"
        const hasActiveSprint = sprintRaw.some((s: unknown) => {
          if (typeof s === 'object' && s !== null) {
            const sprint = s as Record<string, unknown>;
            const state = (sprint['state'] as string | undefined)?.toLowerCase();
            return state === 'active' || state === 'future';
          }
          return false;
        });
        if (hasActiveSprint) return true;
      } else if (typeof sprintRaw === 'object' && sprintRaw !== null) {
        const sprint = sprintRaw as Record<string, unknown>;
        const state = (sprint['state'] as string | undefined)?.toLowerCase();
        if (state === 'active' || state === 'future') return true;
      }
    }

    return false;
  } catch (err) {
    console.warn(`[ROUTER] Could not check sprint status for ${deliveryTicketKey}: ${err}`);
    return false;
  }
}

/**
 * Identify Won't Do candidates from scored groups.
 *
 * For each scored group:
 * 1. Check insufficient description (parent ticket)
 * 2. Check sprint-locked delivery matches
 * 3. Check low impact score
 *
 * A ticket can only trigger one rule (first match wins).
 */
export async function identifyWontDoCandidates(
  scoredGroups: ScoredGroup[],
  jira: JiraClient
): Promise<WontDoCandidate[]> {
  const candidates: WontDoCandidate[] = [];
  const { lowImpactThreshold } = config.wontDo;
  const { baseUrl } = config.jira;

  for (const scored of scoredGroups) {
    const { groupParentKey, impactScore, linkResult } = scored;

    // Fetch the parent ticket details
    let parentTicket: JiraTicket;
    try {
      parentTicket = await jira.getIssue(groupParentKey, [
        'summary', 'description', 'labels', 'reporter',
        'created', 'issuetype', 'status', 'priority',
      ]);
    } catch (err) {
      console.warn(`[ROUTER] Could not fetch parent ticket ${groupParentKey}: ${err}`);
      continue;
    }

    // Determine team from the first match (or a fallback)
    const primaryMatch = linkResult.matches[0];
    const teamName = primaryMatch?.teamName ?? 'Academy';

    // ── Rule 1: Insufficient description ─────────────────────────────────────
    if (isInsufficientDescription(parentTicket.description)) {
      const recipientSlackUserId = getProductOpsSlackUserId(teamName);
      candidates.push({
        ticket: parentTicket,
        teamName,
        reason: 'Insufficient information to action.',
        routingType: 'product-ops',
        recipientSlackUserId,
        impactScore,
        ruleTriggered: 'insufficient-description',
      });
      console.log(
        `[ROUTER] ${groupParentKey} → insufficient description → Product Ops (${teamName})`
      );
      continue;
    }

    // ── Rule 2: Sprint-locked delivery item ───────────────────────────────────
    let sprintLockedTicketKey: string | null = null;
    for (const match of linkResult.matches) {
      const locked = await isSprintLocked(match.workItem.key, jira);
      if (locked) {
        sprintLockedTicketKey = match.workItem.key;
        break;
      }
    }

    if (sprintLockedTicketKey) {
      const matchTeamName = linkResult.matches.find(
        (m) => m.workItem.key === sprintLockedTicketKey
      )?.teamName ?? teamName;
      const recipientSlackUserId = getSquadLeadSlackUserId(matchTeamName);
      const workItemUrl = `${baseUrl}/browse/${sprintLockedTicketKey}`;
      candidates.push({
        ticket: parentTicket,
        teamName: matchTeamName,
        reason: `Already being delivered in ${sprintLockedTicketKey} (${workItemUrl}).`,
        routingType: 'squad-lead',
        recipientSlackUserId,
        impactScore,
        ruleTriggered: 'sprint-locked',
      });
      console.log(
        `[ROUTER] ${groupParentKey} → sprint-locked (${sprintLockedTicketKey}) → Squad Lead (${matchTeamName})`
      );
      continue;
    }

    // ── Rule 3: Low impact score ──────────────────────────────────────────────
    if (impactScore < lowImpactThreshold) {
      const recipientSlackUserId = getSquadLeadSlackUserId(teamName);
      const justification =
        `This ticket has an impact score of ${impactScore.toFixed(2)}, which is below ` +
        `the threshold of ${lowImpactThreshold}. It has ${scored.linkedTicketCount} linked signal(s), ` +
        `a customer segment weight of ${scored.customerSegmentWeight.toFixed(2)}, ` +
        `and an AI severity of ${scored.aiSeverity.toFixed(2)}.`;
      candidates.push({
        ticket: parentTicket,
        teamName,
        reason: justification,
        routingType: 'squad-lead',
        recipientSlackUserId,
        impactScore,
        ruleTriggered: 'low-impact',
      });
      console.log(
        `[ROUTER] ${groupParentKey} → low impact (${impactScore.toFixed(2)}) → Squad Lead (${teamName})`
      );
    }
  }

  return candidates;
}
