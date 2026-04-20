/**
 * Bug Digest — Bug Ticket Detection, Grouping & Slack Block Kit Formatting
 *
 * Sprint 4: Weekly Bug Digest
 *
 * Bug detection rules (OR logic):
 *   1. Jira issue type name contains "Bug" (case-insensitive)
 *   2. Ticket labels contain "Bug" or "bug"
 *
 * Team assignment:
 *   Derived from the team custom field on the Product Feedback ticket
 *   (config.jira.teamFieldId, default "customfield_10060").
 *
 * Audience routing:
 *   Darshini → Academy, Engage
 *   Bryan    → Identity & Payments
 *   Jin Choy → AI & Innovation, Transform
 *
 * Digest format:
 *   One Slack message per Product Ops member, with sections per team they cover.
 *   Each team section groups bug tickets by "theme" (Summary prefix / cluster).
 *   Each group shows: theme name, unique user count, Impact Score, clickable Jira link.
 *   Won't Do candidates get Approve / Approve All buttons (same flow as Sprint 3).
 *   Tickets with insufficient description get a dedicated section.
 *   Empty team sections are omitted. If no bugs exist for a member at all, a
 *   "No bug tickets this week" message is sent.
 *   No Confluence write occurs.
 */

import { WebClient } from '@slack/web-api';
import type { KnownBlock } from '@slack/web-api';
import type { JiraTicket } from '../jira/client.js';
import { config } from '../config/index.js';

export interface BugThemeGroup {
  /** Representative theme label (first ticket's summary, trimmed to 60 chars) */
  theme: string;
  /** All bug tickets in this theme */
  tickets: JiraTicket[];
  /** Unique reporter account IDs (proxy for unique users affected) */
  uniqueUserCount: number;
  /** Impact Score for the group parent ticket (or 0 if not available) */
  impactScore: number;
  /** URL to the Jira parent ticket for this theme group */
  parentTicketUrl: string;
  /** Key of the parent ticket */
  parentTicketKey: string;
}

export interface BugTeamSection {
  teamName: string;
  /** Grouped bug themes for this team */
  themeGroups: BugThemeGroup[];
  /** Bug tickets flagged for insufficient description */
  insufficientDescriptionTickets: JiraTicket[];
  /** Won't Do candidates for this team's bugs */
  wontDoCandidates: WontDoBugCandidate[];
}

export interface WontDoBugCandidate {
  ticket: JiraTicket;
  reason: string;
  impactScore: number;
  messageId: string;
}

export interface ProductOpsBugDigest {
  /** The Product Ops person's name (darshini | bryan | jinChoy) */
  recipientKey: 'darshini' | 'bryan' | 'jinChoy';
  /** Display name for logging */
  recipientDisplayName: string;
  /** Slack user ID of the recipient */
  recipientSlackUserId: string;
  /** Sections for each team they cover (only non-empty sections included) */
  teamSections: BugTeamSection[];
  /** True if there are zero bug tickets across all their teams */
  hasNoBugTickets: boolean;
}

// ── Bug Detection ─────────────────────────────────────────────────────────────

/**
 * Returns true if the ticket is a bug-category ticket.
 * A ticket is a bug if:
 * - Its Jira issue type name contains "bug" (case-insensitive), OR
 * - Its labels array contains "Bug" or "bug"
 */
export function isBugTicket(ticket: JiraTicket): boolean {
  if (ticket.issueType.toLowerCase().includes('bug')) {
    return true;
  }
  if (ticket.labels.some((label) => label.toLowerCase() === 'bug')) {
    return true;
  }
  return false;
}

// ── Team Assignment ───────────────────────────────────────────────────────────

/**
 * Derive the team name from a ticket's custom field (JIRA_FIELD_TEAM).
 *
 * The field may return:
 * - A plain string: the team name
 * - An object with a "value" property: the team name
 * - An object with a "name" property: the team name
 * - null / undefined: unknown team
 */
export function deriveTeamFromTicket(ticket: JiraTicket): string | null {
  const teamFieldId = config.jira.teamFieldId;
  const raw = ticket.customFields[teamFieldId];

  if (!raw) return null;

  if (typeof raw === 'string') {
    return raw.trim() || null;
  }

  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj['value'] === 'string') return (obj['value'] as string).trim() || null;
    if (typeof obj['name'] === 'string') return (obj['name'] as string).trim() || null;
  }

  return null;
}

// ── Audience Routing ──────────────────────────────────────────────────────────

type RecipientKey = 'darshini' | 'bryan' | 'jinChoy';

const DISPLAY_NAMES: Record<RecipientKey, string> = {
  darshini: 'Darshini Mohanadass',
  bryan: 'Bryan Swee',
  jinChoy: 'Jin Choy Chew',
};

/**
 * Returns the recipient key for a given team name.
 * Uses the audienceRouting config (substring match, case-insensitive).
 */
export function getRecipientForTeam(teamName: string): RecipientKey | null {
  const lc = teamName.toLowerCase();
  const { audienceRouting } = config.weeklyDigest;

  for (const [recipientKey, teamKeywords] of Object.entries(audienceRouting)) {
    if (teamKeywords.some((kw) => lc.includes(kw))) {
      return recipientKey as RecipientKey;
    }
  }
  return null;
}

// ── Insufficient Description Detection ───────────────────────────────────────

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

// ── Theme Grouping ────────────────────────────────────────────────────────────

/**
 * Group an array of bug tickets into thematic clusters.
 *
 * Strategy: simple keyword-based grouping by the first 5-7 words of each
 * summary. Tickets with similar prefixes are grouped together.
 * This is intentionally lightweight — the full semantic grouping engine
 * (Sprint 1) runs separately; this is digest-time aggregation only.
 *
 * Each group is associated with the first (oldest) ticket as its parent.
 */
export function groupBugTicketsByTheme(
  tickets: JiraTicket[],
  impactScoreMap: Map<string, number>
): BugThemeGroup[] {
  if (tickets.length === 0) return [];

  const { baseUrl } = config.jira;

  // Sort by created ascending so the oldest ticket becomes the parent
  const sorted = [...tickets].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
  );

  // Simple grouping: extract a "cluster key" from the first 5 words of the summary
  const clusters = new Map<string, JiraTicket[]>();

  for (const ticket of sorted) {
    const words = ticket.summary.trim().split(/\s+/).slice(0, 5).join(' ').toLowerCase();
    // Strip punctuation for clustering
    const clusterKey = words.replace(/[^a-z0-9 ]/g, '').trim();

    let placed = false;
    for (const [existingKey, group] of clusters.entries()) {
      if (clusterKey.length > 0 && existingKey.startsWith(clusterKey.slice(0, Math.min(clusterKey.length, 20)))) {
        group.push(ticket);
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.set(clusterKey, [ticket]);
    }
  }

  const groups: BugThemeGroup[] = [];

  for (const [, groupTickets] of clusters.entries()) {
    const parent = groupTickets[0]!;
    const impactScore = impactScoreMap.get(parent.key) ?? 0;

    // Unique user count: deduplicate by reporter accountId
    const uniqueUserIds = new Set(
      groupTickets.map((t) => t.reporter.accountId).filter(Boolean)
    );

    // Theme: first ticket's summary, capped at 60 chars
    const theme =
      parent.summary.length > 60
        ? parent.summary.slice(0, 57) + '...'
        : parent.summary;

    groups.push({
      theme,
      tickets: groupTickets,
      uniqueUserCount: uniqueUserIds.size || groupTickets.length,
      impactScore,
      parentTicketUrl: `${baseUrl}/browse/${parent.key}`,
      parentTicketKey: parent.key,
    });
  }

  // Sort groups by impact score descending
  groups.sort((a, b) => b.impactScore - a.impactScore);

  return groups;
}

// ── Digest Construction ───────────────────────────────────────────────────────

/**
 * Build the full digest structure for all Product Ops members.
 *
 * @param bugTickets - All bug tickets from Parking Lot (already filtered)
 * @param impactScoreMap - Map of ticket key → impact score
 * @param wontDoCandidates - Won't Do candidates (bug tickets only)
 * @returns One digest entry per Product Ops member
 */
export function buildBugDigests(
  bugTickets: JiraTicket[],
  impactScoreMap: Map<string, number>,
  wontDoCandidates: WontDoBugCandidate[]
): ProductOpsBugDigest[] {
  const { productOps } = config.slack;
  const slackUserIdMap: Record<RecipientKey, string> = {
    darshini: productOps.darshini,
    bryan: productOps.bryan,
    jinChoy: productOps.jinChoy,
  };

  // Group tickets by team, then by recipient
  const ticketsByRecipientAndTeam = new Map<RecipientKey, Map<string, JiraTicket[]>>();
  const wontDoByRecipientAndTeam = new Map<RecipientKey, Map<string, WontDoBugCandidate[]>>();

  const recipientKeys: RecipientKey[] = ['darshini', 'bryan', 'jinChoy'];

  for (const key of recipientKeys) {
    ticketsByRecipientAndTeam.set(key, new Map());
    wontDoByRecipientAndTeam.set(key, new Map());
  }

  // Partition bug tickets by recipient
  for (const ticket of bugTickets) {
    const teamName = deriveTeamFromTicket(ticket) ?? 'Unknown';
    const recipient = getRecipientForTeam(teamName);
    if (!recipient) {
      console.log(`[DIGEST] Ticket ${ticket.key} team "${teamName}" has no audience routing — skipping`);
      continue;
    }

    const recipientTeamMap = ticketsByRecipientAndTeam.get(recipient)!;
    const existing = recipientTeamMap.get(teamName) ?? [];
    existing.push(ticket);
    recipientTeamMap.set(teamName, existing);
  }

  // Partition Won't Do candidates by recipient
  for (const candidate of wontDoCandidates) {
    const teamName = deriveTeamFromTicket(candidate.ticket) ?? 'Unknown';
    const recipient = getRecipientForTeam(teamName);
    if (!recipient) continue;

    const recipientWontDoMap = wontDoByRecipientAndTeam.get(recipient)!;
    const existing = recipientWontDoMap.get(teamName) ?? [];
    existing.push(candidate);
    recipientWontDoMap.set(teamName, existing);
  }

  // Build digests
  const digests: ProductOpsBugDigest[] = [];

  for (const recipientKey of recipientKeys) {
    const teamTicketMap = ticketsByRecipientAndTeam.get(recipientKey)!;
    const teamWontDoMap = wontDoByRecipientAndTeam.get(recipientKey)!;
    const teamSections: BugTeamSection[] = [];

    for (const [teamName, teamTickets] of teamTicketMap.entries()) {
      if (teamTickets.length === 0) continue;

      // Split into insufficient-description vs normal tickets
      const insufficientTickets = teamTickets.filter((t) => isInsufficientDescription(t.description));
      const actionableTickets = teamTickets.filter((t) => !isInsufficientDescription(t.description));

      // Group actionable tickets by theme
      const themeGroups = groupBugTicketsByTheme(actionableTickets, impactScoreMap);

      // Won't Do candidates for this team
      const teamWontDos = teamWontDoMap.get(teamName) ?? [];

      teamSections.push({
        teamName,
        themeGroups,
        insufficientDescriptionTickets: insufficientTickets,
        wontDoCandidates: teamWontDos,
      });
    }

    // Sort sections by team name for deterministic output
    teamSections.sort((a, b) => a.teamName.localeCompare(b.teamName));

    const hasNoBugTickets = teamSections.length === 0;

    digests.push({
      recipientKey,
      recipientDisplayName: DISPLAY_NAMES[recipientKey],
      recipientSlackUserId: slackUserIdMap[recipientKey],
      teamSections,
      hasNoBugTickets,
    });
  }

  return digests;
}

// ── Slack Block Kit Formatter ─────────────────────────────────────────────────

export interface DigestButtonPayload {
  messageId: string;
  ticketKey: string;
  action: 'approve' | 'approve_all';
  digestType: 'bug_digest';
}

/**
 * Build Block Kit blocks for a single Product Ops member's bug digest message.
 */
export function buildBugDigestBlocks(digest: ProductOpsBugDigest): KnownBlock[] {
  const blocks: KnownBlock[] = [];
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // ── Header ─────────────────────────────────────────────────────────────────
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: 'Weekly Bug Digest',
      emoji: true,
    },
  });

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text:
        `*Weekly Bug Report — ${today}*\n` +
        `Hello ${digest.recipientDisplayName.split(' ')[0]}, here is your bug ticket summary for this week.`,
    },
  });

  blocks.push({ type: 'divider' });

  // ── No-bugs fallback ───────────────────────────────────────────────────────
  if (digest.hasNoBugTickets) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'No bug tickets this week for your teams. Have a great week!',
      },
    });
    return blocks;
  }

  // ── Per-team sections ─────────────────────────────────────────────────────
  for (const section of digest.teamSections) {
    // Team header
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Team: ${section.teamName}*`,
      },
    });

    // Theme groups
    if (section.themeGroups.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Bug Themes*',
        },
      });

      for (const group of section.themeGroups) {
        const ticketCount = group.tickets.length;
        const jiraLink = `<${group.parentTicketUrl}|${group.parentTicketKey}>`;
        const scoreDisplay = group.impactScore > 0
          ? group.impactScore.toFixed(2)
          : 'N/A';

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `• *${group.theme}*\n` +
              `  > *Tickets:* ${ticketCount}  |  *Unique Users Affected:* ${group.uniqueUserCount}  |  *Impact Score:* ${scoreDisplay}\n` +
              `  > *Parent Ticket:* ${jiraLink}`,
          },
        });
      }
    }

    // Insufficient description section
    if (section.insufficientDescriptionTickets.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Tickets Requiring Description (Product Ops Approval Needed)*',
        },
      });

      for (const ticket of section.insufficientDescriptionTickets) {
        const { baseUrl } = config.jira;
        const jiraUrl = `${baseUrl}/browse/${ticket.key}`;
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `• *<${jiraUrl}|${ticket.key}>* — ${ticket.summary}\n` +
              `  > Description is missing or insufficient. Please update the ticket.`,
          },
        });
      }
    }

    // Won't Do candidates
    if (section.wontDoCandidates.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "*Won't Do Candidates — Approval Required*",
        },
      });

      for (const candidate of section.wontDoCandidates) {
        const { baseUrl } = config.jira;
        const jiraUrl = `${baseUrl}/browse/${candidate.ticket.key}`;

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `• *<${jiraUrl}|${candidate.ticket.key}>* — ${candidate.ticket.summary}\n` +
              `  > *Reason:* ${candidate.reason}\n` +
              `  > *Impact Score:* ${candidate.impactScore.toFixed(2)}`,
          },
        });

        const approvePayload: DigestButtonPayload = {
          messageId: candidate.messageId,
          ticketKey: candidate.ticket.key,
          action: 'approve',
          digestType: 'bug_digest',
        };

        blocks.push({
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Approve', emoji: false },
              style: 'primary',
              action_id: `bug_digest_approve_${candidate.ticket.key}`,
              value: JSON.stringify(approvePayload),
            },
          ],
        });
      }

      // Approve All button for Won't Do candidates
      if (section.wontDoCandidates.length > 1) {
        const firstCandidate = section.wontDoCandidates[0]!;
        const approveAllPayload: DigestButtonPayload = {
          messageId: firstCandidate.messageId,
          ticketKey: '__all__',
          action: 'approve_all',
          digestType: 'bug_digest',
        };

        blocks.push({
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: "Approve All Won't Do", emoji: false },
              style: 'danger',
              confirm: {
                title: { type: 'plain_text', text: "Confirm Approve All" },
                text: {
                  type: 'mrkdwn',
                  text: `Are you sure you want to move *all* listed Won't Do candidates for *${section.teamName}* to Won't Do in Jira?`,
                },
                confirm: { type: 'plain_text', text: 'Yes, approve all' },
                deny: { type: 'plain_text', text: 'Cancel' },
              },
              action_id: `bug_digest_approve_all_${section.teamName.replace(/\s+/g, '_')}`,
              value: JSON.stringify(approveAllPayload),
            },
          ],
        });
      }
    }

    blocks.push({ type: 'divider' });
  }

  return blocks;
}

// ── Slack Sender ──────────────────────────────────────────────────────────────

let _client: WebClient | null = null;

function getSlackClient(): WebClient {
  if (!_client) {
    _client = new WebClient(config.slack.botToken);
  }
  return _client;
}

/**
 * Send a bug digest Slack message to the given channel.
 * Returns the Slack message ts.
 */
export async function sendBugDigestMessage(
  digest: ProductOpsBugDigest
): Promise<string> {
  const client = getSlackClient();
  const channel = config.slack.channel;

  const blocks = buildBugDigestBlocks(digest);

  const summaryLine = digest.hasNoBugTickets
    ? 'No bug tickets this week for your teams.'
    : `Weekly Bug Digest — ${digest.teamSections.reduce((sum, s) => sum + s.themeGroups.length, 0)} theme(s) across ${digest.teamSections.length} team(s)`;

  const fallbackText = `Weekly Bug Digest for ${digest.recipientDisplayName}: ${summaryLine}`;

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
    `[BUG DIGEST] Message sent for ${digest.recipientDisplayName}, ts=${result.ts}, ` +
    `teams=${digest.teamSections.map((s) => s.teamName).join(', ') || 'none'}`
  );

  return result.ts;
}
