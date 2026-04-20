/**
 * Impact Score Aggregation & Ranking
 *
 * Formula (from PRD):
 *   Impact Score = linkedTicketCount × customerSegmentWeight × aiSeverity
 *
 * - linkedTicketCount: number of child tickets in the group (unique signals)
 * - customerSegmentWeight: read from a Jira custom field on the parent ticket
 * - aiSeverity: read from a Jira custom field on the parent ticket
 *
 * If either custom field is missing/invalid, defaults to 1.0 (neutral multiplier).
 *
 * Groups are ranked per team in descending Impact Score order.
 * The top-N (configurable, default 5) are returned as structured output for digests.
 */

import type { TicketGroup } from '../grouping/engine.js';
import type { GroupLinkResult } from './matcher.js';
import { config } from '../config/index.js';

export interface ScoredGroup {
  /** The Product Feedback parent ticket key */
  groupParentKey: string;
  /** Number of child tickets (linked signal count) */
  linkedTicketCount: number;
  /** Customer segment weight from Jira custom field (default 1.0 if missing) */
  customerSegmentWeight: number;
  /** AI severity from Jira custom field (default 1.0 if missing) */
  aiSeverity: number;
  /** Final computed Impact Score */
  impactScore: number;
  /** Link result from the cross-project matcher */
  linkResult: GroupLinkResult;
}

export interface TeamDigestEntry {
  /** Delivery team name */
  teamName: string;
  /** Top-N scored groups for this team (descending Impact Score) */
  topGroups: ScoredGroup[];
}

/**
 * Read a numeric value from a Jira custom field.
 * Jira custom fields can be a raw number, a string, or an object with a "value" property.
 * Returns the default value if the field is missing or not parseable.
 */
function readNumericField(
  customFields: Record<string, unknown>,
  fieldId: string,
  defaultValue: number = 1.0
): number {
  const raw = customFields[fieldId];

  if (raw === null || raw === undefined) {
    return defaultValue;
  }

  if (typeof raw === 'number') {
    return isFinite(raw) && raw > 0 ? raw : defaultValue;
  }

  if (typeof raw === 'string') {
    const parsed = parseFloat(raw);
    return isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  }

  // Jira select/option fields return { value: "...", id: "..." }
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj['value'] === 'number') {
      return isFinite(obj['value']) && obj['value'] > 0 ? obj['value'] : defaultValue;
    }
    if (typeof obj['value'] === 'string') {
      const parsed = parseFloat(obj['value']);
      return isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
    }
  }

  return defaultValue;
}

/**
 * Compute the Impact Score for a single ticket group.
 *
 * linkedTicketCount is the number of children (unique child tickets in the group).
 * customerSegmentWeight and aiSeverity come from Jira custom fields on the parent.
 */
export function computeImpactScore(group: TicketGroup): ScoredGroup {
  const {
    customerSegmentWeightFieldId,
    aiSeverityFieldId,
  } = config.impactScore;

  const linkedTicketCount = group.children.length;
  const customerSegmentWeight = readNumericField(
    group.parent.customFields,
    customerSegmentWeightFieldId
  );
  const aiSeverity = readNumericField(
    group.parent.customFields,
    aiSeverityFieldId
  );

  // Use max of 1 for linkedTicketCount so singleton groups still score > 0
  const effectiveCount = Math.max(linkedTicketCount, 1);
  const impactScore = effectiveCount * customerSegmentWeight * aiSeverity;

  return {
    groupParentKey: group.parent.key,
    linkedTicketCount,
    customerSegmentWeight,
    aiSeverity,
    impactScore,
    // linkResult will be set by the caller after matching
    linkResult: {
      groupParentKey: group.parent.key,
      matches: [],
      noMatchMessage: null,
      priorityBumpRecommendation: null,
    },
  };
}

/**
 * Rank all scored groups by Impact Score (descending) and organise into
 * per-team top-N digest entries.
 *
 * Only groups that matched at least one delivery project work item are included
 * in that team's digest. Groups with no matches are excluded from all team digests.
 */
export function rankGroupsForDigest(scoredGroups: ScoredGroup[]): TeamDigestEntry[] {
  const { topNPerTeam } = config.impactScore;
  const { teamProjectKeys } = config.jira;

  // Build a map: teamName → ScoredGroup[] (groups that matched this team)
  const teamMap = new Map<string, ScoredGroup[]>();

  // Initialise all known teams
  for (const teamName of Object.keys(teamProjectKeys)) {
    teamMap.set(teamName, []);
  }

  for (const scored of scoredGroups) {
    for (const match of scored.linkResult.matches) {
      const existing = teamMap.get(match.teamName) ?? [];
      // Avoid adding the same group twice to a team (multiple matches possible)
      const alreadyAdded = existing.some(
        (s) => s.groupParentKey === scored.groupParentKey
      );
      if (!alreadyAdded) {
        existing.push(scored);
        teamMap.set(match.teamName, existing);
      }
    }
  }

  // Sort each team's groups by Impact Score descending, take top N
  const digest: TeamDigestEntry[] = [];
  for (const [teamName, groups] of teamMap.entries()) {
    const sorted = [...groups].sort((a, b) => b.impactScore - a.impactScore);
    const topGroups = sorted.slice(0, topNPerTeam);
    digest.push({ teamName, topGroups });
  }

  // Sort digest by team name for deterministic output
  digest.sort((a, b) => a.teamName.localeCompare(b.teamName));

  return digest;
}
