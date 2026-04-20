/**
 * Automated Feedback Prioritization & Insight Delivery
 * Sprint 1 & 2: Jira Integration, Semantic Ticket Grouping,
 *               Cross-Project Linking & Impact Ranking
 *
 * Main export barrel — re-exports core modules for programmatic use.
 * To run the grouping pipeline: pnpm start (or pnpm group for ts-node)
 * To run the linking pipeline:  pnpm link  (or node dist/pipeline/link.js)
 */

export { JiraClient } from './jira/client.js';
export type { JiraTicket, JiraIssueLink, IssueLinkType } from './jira/client.js';

export { GroupingEngine } from './grouping/engine.js';
export type { TicketGroup, GroupingResult } from './grouping/engine.js';

export { computeSimilarity, computeGroupSimilarity, ticketToText } from './similarity/index.js';

export { isSecurityOrComplianceTicket } from './grouping/security.js';

export { computeDeduplicatedSignals } from './grouping/deduplication.js';
export type { DeduplicatedGroup } from './grouping/deduplication.js';

export { loadRunState, saveRunState, advanceRunState, getSinceDate } from './state/index.js';
export type { RunState } from './state/index.js';

export { writeRunLog } from './logger/index.js';
export type { RunLogEntry } from './logger/index.js';

// Sprint 2 exports
export { findBestMatch, linkGroupToDeliveryProjects } from './linking/matcher.js';
export type {
  MatchedWorkItem,
  GroupLinkResult,
  PriorityBumpRecommendation,
} from './linking/matcher.js';

export { computeImpactScore, rankGroupsForDigest } from './linking/scorer.js';
export type { ScoredGroup, TeamDigestEntry } from './linking/scorer.js';
