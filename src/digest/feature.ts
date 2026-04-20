/**
 * Feature Digest — Feature Ticket Detection, Synthesis & Slack Block Kit Formatting
 *
 * Sprint 5: Monthly Feature Digest
 *
 * Feature detection rules:
 *   A ticket is a "feature" if its Jira issuetype.name contains "Feature" or "Idea"
 *   (case-insensitive) AND it is NOT a bug (no "Bug" in issuetype).
 *
 * Squad Lead routing (per team):
 *   Transform          → Sambruce Joseph   (SLACK_USER_SAMBRUCE)
 *   Engage             → Palak Varma       (SLACK_USER_PALAK)
 *   Identity & Payments→ Natasha Tomkinson (SLACK_USER_NATASHA)
 *   Academy            → Amanda Shin       (SLACK_USER_AMANDA)
 *   AI & Innovation    → Suresh Sakadivan  (SLACK_USER_SURESH)
 *
 * Monthly digest format (per squad lead):
 *   - Top-5 feature themes (ranked by Impact Score)
 *     Each shows: unique user count, synthesised user story, pain point,
 *     business value label, Jira link, delivery work item link status
 *   - Notable Trends section (themes not in top 5 with exactly 2–3 unique reporters)
 *   - Won't Do resurfacing section (previously Won't Do'd tickets with ≥3 new similar)
 *   - Won't Do candidate list with Approve + Approve All buttons
 *
 * Claude synthesis (per theme):
 *   Batched into a single prompt to minimise API calls.
 *   Returns: userStory, painPoint, businessValue (engagement|consumption|retention)
 */

import Anthropic from '@anthropic-ai/sdk';
import { WebClient } from '@slack/web-api';
import type { KnownBlock } from '@slack/web-api';
import type { JiraTicket } from '../jira/client.js';
import { isBugTicket, deriveTeamFromTicket } from './bug.js';
import { config } from '../config/index.js';

// ── Anthropic client ──────────────────────────────────────────────────────────

let _anthropic: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return _anthropic;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type BusinessValue = 'engagement' | 'consumption' | 'retention';

export interface ThemeSynthesis {
  userStory: string;
  painPoint: string;
  businessValue: BusinessValue;
}

export interface FeatureThemeGroup {
  /** Representative theme label (first ticket's summary, trimmed to 60 chars) */
  theme: string;
  /** All feature tickets in this theme group */
  tickets: JiraTicket[];
  /** Unique reporter account IDs count */
  uniqueUserCount: number;
  /** Impact Score for the group (from scorer) */
  impactScore: number;
  /** URL to the Jira parent ticket */
  parentTicketUrl: string;
  /** Key of the parent ticket */
  parentTicketKey: string;
  /** Whether the group is linked to a delivery work item */
  linkedToDelivery: boolean;
  /** Claude-synthesised content (user story, pain point, business value) */
  synthesis: ThemeSynthesis | null;
}

export interface ResurfacedTicket {
  /** Original ticket key that was moved to Won't Do */
  ticketKey: string;
  /** Date it was marked Won't Do */
  wontDoDate: string;
  /** Number of new semantically-similar tickets since */
  newSimilarCount: number;
  /** Team name stored at Won't Do time — used for routing when ticket is no longer in Parking Lot */
  team: string;
}

export interface SquadLeadDigest {
  /** Squad lead identifier */
  squadLeadKey: 'sambruce' | 'palak' | 'natasha' | 'amanda' | 'suresh';
  /** Display name for logging */
  squadLeadDisplayName: string;
  /** Slack user ID */
  squadLeadSlackUserId: string;
  /** Team name */
  teamName: string;
  /** Top-5 feature themes (ranked by Impact Score) */
  topThemes: FeatureThemeGroup[];
  /** Notable Trends: not top-5, exactly 2–3 unique reporters */
  notableTrends: FeatureThemeGroup[];
  /** Previously Won't Do'd tickets with ≥3 new similar arrivals */
  resurfacedTickets: ResurfacedTicket[];
  /** Won't Do feature candidates with Approve / Approve All buttons */
  wontDoCandidates: WontDoFeatureCandidate[];
}

export interface WontDoFeatureCandidate {
  ticket: JiraTicket;
  reason: string;
  impactScore: number;
  messageId: string;
}

export interface DigestFeatureButtonPayload {
  messageId: string;
  ticketKey: string;
  action: 'approve' | 'approve_all';
  digestType: 'feature_digest';
}

// ── Feature Detection ─────────────────────────────────────────────────────────

/**
 * Returns true if the ticket is a feature-category ticket.
 * A ticket is a feature if:
 * - Its Jira issue type name contains "feature" or "idea" (case-insensitive)
 * - AND it is NOT a bug
 */
export function isFeatureTicket(ticket: JiraTicket): boolean {
  const issueTypeLower = ticket.issueType.toLowerCase();
  const isFeatureType =
    issueTypeLower.includes('feature') || issueTypeLower.includes('idea');
  return isFeatureType && !isBugTicket(ticket);
}

// ── Squad Lead Routing ────────────────────────────────────────────────────────

export type SquadLeadKey = 'sambruce' | 'palak' | 'natasha' | 'amanda' | 'suresh';

const SQUAD_LEAD_DISPLAY_NAMES: Record<SquadLeadKey, string> = {
  sambruce: 'Sambruce Joseph',
  palak: 'Palak Varma',
  natasha: 'Natasha Tomkinson',
  amanda: 'Amanda Shin',
  suresh: 'Suresh Sakadivan',
};

const SQUAD_LEAD_TEAM_MAP: Record<SquadLeadKey, string[]> = {
  sambruce: ['transform'],
  palak: ['engage'],
  natasha: ['identity', 'payment'],
  amanda: ['academy'],
  suresh: ['ai', 'innovation'],
};

/**
 * Returns the squad lead key for a given team name.
 * Uses substring match (case-insensitive).
 */
export function getSquadLeadForTeam(teamName: string): SquadLeadKey | null {
  const lc = teamName.toLowerCase();
  for (const [key, keywords] of Object.entries(SQUAD_LEAD_TEAM_MAP)) {
    if (keywords.some((kw) => lc.includes(kw))) {
      return key as SquadLeadKey;
    }
  }
  return null;
}

function getSquadLeadSlackUserId(key: SquadLeadKey): string {
  const { squadLeads } = config.slack;
  const map: Record<SquadLeadKey, string> = {
    sambruce: squadLeads.sambruce,
    palak: squadLeads.palak,
    natasha: squadLeads.natasha,
    amanda: squadLeads.amanda,
    suresh: squadLeads.suresh,
  };
  return map[key];
}

// ── Theme Grouping (same lightweight strategy as bug.ts) ─────────────────────

/**
 * Group feature tickets into thematic clusters by summary prefix.
 */
export function groupFeatureTicketsByTheme(
  tickets: JiraTicket[],
  impactScoreMap: Map<string, number>,
  linkedDeliveryKeys: Set<string>
): FeatureThemeGroup[] {
  if (tickets.length === 0) return [];

  const { baseUrl } = config.jira;

  const sorted = [...tickets].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
  );

  const clusters = new Map<string, JiraTicket[]>();

  for (const ticket of sorted) {
    const words = ticket.summary.trim().split(/\s+/).slice(0, 5).join(' ').toLowerCase();
    const clusterKey = words.replace(/[^a-z0-9 ]/g, '').trim();

    let placed = false;
    for (const [existingKey, group] of clusters.entries()) {
      if (
        clusterKey.length > 0 &&
        existingKey.startsWith(clusterKey.slice(0, Math.min(clusterKey.length, 20)))
      ) {
        group.push(ticket);
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.set(clusterKey, [ticket]);
    }
  }

  const groups: FeatureThemeGroup[] = [];

  for (const [, groupTickets] of clusters.entries()) {
    const parent = groupTickets[0]!;
    const impactScore = impactScoreMap.get(parent.key) ?? 0;

    const uniqueUserIds = new Set(
      groupTickets.map((t) => t.reporter.accountId).filter(Boolean)
    );

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
      linkedToDelivery: linkedDeliveryKeys.has(parent.key),
      synthesis: null,
    });
  }

  groups.sort((a, b) => b.impactScore - a.impactScore);

  return groups;
}

// ── Claude Synthesis ──────────────────────────────────────────────────────────

/**
 * Synthesise user story, pain point, and business value for a single theme group.
 * Batches all required content into ONE Claude API call per theme.
 */
export async function synthesiseTheme(group: FeatureThemeGroup): Promise<ThemeSynthesis> {
  const anthropic = getAnthropicClient();

  const ticketSummaries = group.tickets
    .slice(0, 5)
    .map((t, i) => `${i + 1}. ${t.summary}${t.description ? ': ' + t.description.slice(0, 200) : ''}`)
    .join('\n');

  const prompt = `You are a product manager analysing feature requests from ${group.uniqueUserCount} user(s).

Feature theme: "${group.theme}"

Tickets in this theme:
${ticketSummaries}

Based on these tickets, provide:
1. A user story in strict format: "As a [user type], I want [goal] so that [benefit]."
2. A one-sentence pain point describing what users currently struggle with.
3. A business value label — pick exactly ONE from: engagement, consumption, retention.

Respond with ONLY a JSON object in this exact format:
{
  "userStory": "As a ..., I want ... so that ...",
  "painPoint": "One sentence describing the pain.",
  "businessValue": "engagement"
}`;

  const message = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawContent = message.content[0];
  if (rawContent.type !== 'text') {
    throw new Error('Unexpected response type from Claude synthesis API');
  }

  const text = rawContent.text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse synthesis JSON from: ${text}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    userStory: string;
    painPoint: string;
    businessValue: string;
  };

  const validBusinessValues: BusinessValue[] = ['engagement', 'consumption', 'retention'];
  const businessValue = validBusinessValues.includes(parsed.businessValue as BusinessValue)
    ? (parsed.businessValue as BusinessValue)
    : 'engagement';

  return {
    userStory: parsed.userStory ?? '',
    painPoint: parsed.painPoint ?? '',
    businessValue,
  };
}

/**
 * Synthesise all themes in the top-5 list (one Claude call per theme).
 * Mutates the theme objects in place.
 */
export async function synthesiseTopThemes(themes: FeatureThemeGroup[]): Promise<void> {
  for (const theme of themes) {
    try {
      theme.synthesis = await synthesiseTheme(theme);
      console.log(
        `[SYNTHESIS] ${theme.parentTicketKey}: businessValue=${theme.synthesis.businessValue}`
      );
    } catch (err) {
      console.warn(
        `[SYNTHESIS] Failed to synthesise theme for ${theme.parentTicketKey}: ${err}`
      );
      // Use fallback values so the digest still renders
      theme.synthesis = {
        userStory: 'User story not available.',
        painPoint: 'Pain point not available.',
        businessValue: 'engagement',
      };
    }
  }
}

// ── Digest Construction ───────────────────────────────────────────────────────

/**
 * Build per-squad-lead feature digest structures.
 *
 * @param featureTickets - All feature tickets from Parking Lot
 * @param impactScoreMap - Map of parent ticket key → impact score
 * @param linkedDeliveryKeys - Set of group parent keys that are linked to delivery items
 * @param wontDoCandidates - Won't Do candidates for feature tickets
 * @param resurfacedTickets - Previously Won't Do'd tickets with ≥3 new similar
 * @returns One digest entry per squad lead whose team has feature tickets
 */
export async function buildFeatureDigests(
  featureTickets: JiraTicket[],
  impactScoreMap: Map<string, number>,
  linkedDeliveryKeys: Set<string>,
  wontDoCandidates: WontDoFeatureCandidate[],
  resurfacedTickets: ResurfacedTicket[]
): Promise<SquadLeadDigest[]> {
  const { squadLeads } = config.slack;
  const slackUserIdMap: Record<SquadLeadKey, string> = {
    sambruce: squadLeads.sambruce,
    palak: squadLeads.palak,
    natasha: squadLeads.natasha,
    amanda: squadLeads.amanda,
    suresh: squadLeads.suresh,
  };

  // Group tickets by squad lead key, then by team name
  const ticketsBySquadLead = new Map<SquadLeadKey, Map<string, JiraTicket[]>>();
  const wontDoBySquadLead = new Map<SquadLeadKey, WontDoFeatureCandidate[]>();
  const resurfacedBySquadLead = new Map<SquadLeadKey, ResurfacedTicket[]>();

  const squadLeadKeys: SquadLeadKey[] = ['sambruce', 'palak', 'natasha', 'amanda', 'suresh'];
  for (const key of squadLeadKeys) {
    ticketsBySquadLead.set(key, new Map());
    wontDoBySquadLead.set(key, []);
    resurfacedBySquadLead.set(key, []);
  }

  // Partition feature tickets by squad lead
  for (const ticket of featureTickets) {
    const teamName = deriveTeamFromTicket(ticket);
    if (!teamName) {
      console.log(`[FEATURE DIGEST] Ticket ${ticket.key} has no team — skipping`);
      continue;
    }
    const squadLeadKey = getSquadLeadForTeam(teamName);
    if (!squadLeadKey) {
      console.log(`[FEATURE DIGEST] Team "${teamName}" has no squad lead mapping — skipping`);
      continue;
    }

    const teamMap = ticketsBySquadLead.get(squadLeadKey)!;
    const existing = teamMap.get(teamName) ?? [];
    existing.push(ticket);
    teamMap.set(teamName, existing);
  }

  // Partition Won't Do candidates by squad lead
  for (const candidate of wontDoCandidates) {
    const teamName = deriveTeamFromTicket(candidate.ticket);
    if (!teamName) continue;
    const squadLeadKey = getSquadLeadForTeam(teamName);
    if (!squadLeadKey) continue;

    const existing = wontDoBySquadLead.get(squadLeadKey)!;
    existing.push(candidate);
    wontDoBySquadLead.set(squadLeadKey, existing);
  }

  // Partition resurfaced tickets by squad lead.
  // Use the team stored in the ResurfacingResult (set at Won't Do time) so that
  // routing works even when the ticket is no longer in Parking Lot.
  for (const resurfaced of resurfacedTickets) {
    const teamName = resurfaced.team;
    if (!teamName) {
      console.log(`[FEATURE DIGEST] Resurfaced ticket ${resurfaced.ticketKey} has no stored team — skipping`);
      continue;
    }
    const squadLeadKey = getSquadLeadForTeam(teamName);
    if (!squadLeadKey) continue;

    const existing = resurfacedBySquadLead.get(squadLeadKey)!;
    existing.push(resurfaced);
    resurfacedBySquadLead.set(squadLeadKey, existing);
  }

  // Build per-squad-lead digests
  const digests: SquadLeadDigest[] = [];

  for (const squadLeadKey of squadLeadKeys) {
    const teamMap = ticketsBySquadLead.get(squadLeadKey)!;

    // Collect all tickets for this squad lead across all their teams
    const allTickets: JiraTicket[] = [];
    for (const [, teamTickets] of teamMap.entries()) {
      allTickets.push(...teamTickets);
    }

    if (allTickets.length === 0) {
      // No feature tickets for this squad lead — skip
      continue;
    }

    // Derive primary team name (the one with most tickets)
    let primaryTeamName = '';
    let maxTeamCount = 0;
    for (const [teamName, teamTickets] of teamMap.entries()) {
      if (teamTickets.length > maxTeamCount) {
        maxTeamCount = teamTickets.length;
        primaryTeamName = teamName;
      }
    }

    // Group all tickets by theme
    const allThemes = groupFeatureTicketsByTheme(allTickets, impactScoreMap, linkedDeliveryKeys);

    // Top 5 by impact score
    const topThemes = allThemes.slice(0, 5);

    // Notable Trends: themes NOT in top 5 with exactly 2 or 3 unique reporters
    const notableTrends = allThemes.slice(5).filter(
      (t) => t.uniqueUserCount === 2 || t.uniqueUserCount === 3
    );

    // Synthesise top-5 themes via Claude
    await synthesiseTopThemes(topThemes);

    digests.push({
      squadLeadKey,
      squadLeadDisplayName: SQUAD_LEAD_DISPLAY_NAMES[squadLeadKey],
      squadLeadSlackUserId: slackUserIdMap[squadLeadKey],
      teamName: primaryTeamName,
      topThemes,
      notableTrends,
      resurfacedTickets: resurfacedBySquadLead.get(squadLeadKey) ?? [],
      wontDoCandidates: wontDoBySquadLead.get(squadLeadKey) ?? [],
    });
  }

  return digests;
}

// ── Slack Block Kit Formatter ─────────────────────────────────────────────────

/**
 * Build Block Kit blocks for a single squad lead's monthly feature digest.
 */
export function buildFeatureDigestBlocks(digest: SquadLeadDigest): KnownBlock[] {
  const blocks: KnownBlock[] = [];
  const { baseUrl } = config.jira;

  const now = new Date();
  const monthYear = now.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  // ── Header ─────────────────────────────────────────────────────────────────
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: 'Monthly Feature Insight Digest',
      emoji: true,
    },
  });

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text:
        `*Monthly Feature Digest — ${monthYear}*\n` +
        `Hello ${digest.squadLeadDisplayName.split(' ')[0]}, here are the top feature insights for *${digest.teamName}* this month.`,
    },
  });

  blocks.push({ type: 'divider' });

  // ── Top 5 Feature Themes ───────────────────────────────────────────────────
  if (digest.topThemes.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Top Feature Themes*',
      },
    });

    for (let i = 0; i < digest.topThemes.length; i++) {
      const theme = digest.topThemes[i]!;
      const jiraLink = `<${theme.parentTicketUrl}|${theme.parentTicketKey}>`;
      const deliveryStatus = theme.linkedToDelivery
        ? 'Linked to delivery work item'
        : 'Not linked to any delivery work item';
      const scoreDisplay = theme.impactScore > 0
        ? theme.impactScore.toFixed(2)
        : 'N/A';

      let themeText =
        `*${i + 1}. ${theme.theme}*\n` +
        `> *Unique Users:* ${theme.uniqueUserCount}  |  *Impact Score:* ${scoreDisplay}  |  *Ticket:* ${jiraLink}\n` +
        `> *Delivery:* ${deliveryStatus}\n`;

      if (theme.synthesis) {
        const { userStory, painPoint, businessValue } = theme.synthesis;
        themeText +=
          `> *User Story:* ${userStory}\n` +
          `> *Pain Point:* ${painPoint}\n` +
          `> *Business Value:* ${businessValue}`;
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: themeText,
        },
      });
    }
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'No feature themes found for your team this month.',
      },
    });
  }

  // ── Notable Trends ─────────────────────────────────────────────────────────
  if (digest.notableTrends.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Notable Trends*',
      },
    });

    for (const trend of digest.notableTrends) {
      const jiraLink = `<${trend.parentTicketUrl}|${trend.parentTicketKey}>`;
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `• *${trend.theme}* — ${jiraLink}\n` +
            `  > Early signal — ${trend.uniqueUserCount} reporters`,
        },
      });
    }
  }

  // ── Won't Do Resurfacing ───────────────────────────────────────────────────
  if (digest.resurfacedTickets.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "*Won't Do — Resurfaced Tickets*",
      },
    });

    for (const resurfaced of digest.resurfacedTickets) {
      const jiraUrl = `${baseUrl}/browse/${resurfaced.ticketKey}`;
      const formattedDate = new Date(resurfaced.wontDoDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `• *<${jiraUrl}|${resurfaced.ticketKey}>*\n` +
            `  > Previously marked Won't Do on ${formattedDate}. ` +
            `${resurfaced.newSimilarCount} new similar ticket(s) have surfaced since.`,
        },
      });
    }
  }

  // ── Won't Do Candidates ────────────────────────────────────────────────────
  if (digest.wontDoCandidates.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "*Feature Won't Do Candidates — Approval Required*",
      },
    });

    for (const candidate of digest.wontDoCandidates) {
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

      const approvePayload: DigestFeatureButtonPayload = {
        messageId: candidate.messageId,
        ticketKey: candidate.ticket.key,
        action: 'approve',
        digestType: 'feature_digest',
      };

      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve', emoji: false },
            style: 'primary',
            action_id: `feature_digest_approve_${candidate.ticket.key}`,
            value: JSON.stringify(approvePayload),
          },
        ],
      });
    }

    // Approve All button
    if (digest.wontDoCandidates.length > 1) {
      const firstCandidate = digest.wontDoCandidates[0]!;
      const approveAllPayload: DigestFeatureButtonPayload = {
        messageId: firstCandidate.messageId,
        ticketKey: '__all__',
        action: 'approve_all',
        digestType: 'feature_digest',
      };

      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: "Approve All Won't Do", emoji: false },
            style: 'danger',
            confirm: {
              title: { type: 'plain_text', text: 'Confirm Approve All' },
              text: {
                type: 'mrkdwn',
                text: `Are you sure you want to move *all* listed feature Won't Do candidates for *${digest.teamName}* to Won't Do in Jira?`,
              },
              confirm: { type: 'plain_text', text: 'Yes, approve all' },
              deny: { type: 'plain_text', text: 'Cancel' },
            },
            action_id: `feature_digest_approve_all_${digest.teamName.replace(/\s+/g, '_')}`,
            value: JSON.stringify(approveAllPayload),
          },
        ],
      });
    }
  }

  return blocks;
}

// ── Slack Sender ──────────────────────────────────────────────────────────────

let _slackClient: WebClient | null = null;

function getSlackClient(): WebClient {
  if (!_slackClient) {
    _slackClient = new WebClient(config.slack.botToken);
  }
  return _slackClient;
}

/**
 * Send a feature digest Slack message for one squad lead.
 * Returns the Slack message ts.
 */
export async function sendFeatureDigestMessage(digest: SquadLeadDigest): Promise<string> {
  const client = getSlackClient();
  const channel = config.slack.channel;

  const blocks = buildFeatureDigestBlocks(digest);

  const themeCount = digest.topThemes.length;
  const fallbackText =
    `Monthly Feature Digest for ${digest.squadLeadDisplayName} — ` +
    `${themeCount} top theme(s) for ${digest.teamName}`;

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
    `[FEATURE DIGEST] Message sent for ${digest.squadLeadDisplayName}, ts=${result.ts}, ` +
    `team=${digest.teamName}, topThemes=${themeCount}, notableTrends=${digest.notableTrends.length}`
  );

  return result.ts;
}
