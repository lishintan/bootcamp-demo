import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

/**
 * Parse a comma-separated list of "TeamName:PROJECT_KEY" pairs.
 * Falls back to defaults if env var is not set.
 * Example: "Engage:ENG,Transform:TRF,AI & Innovation:AIINN,Academy:ACA,Identity & Payments:IAP"
 */
function parseTeamProjectKeys(): Record<string, string> {
  const raw = process.env['JIRA_TEAM_PROJECT_KEYS'];
  const defaults: Record<string, string> = {
    Engage: process.env['JIRA_PROJECT_KEY_ENGAGE'] ?? 'ENG',
    Transform: process.env['JIRA_PROJECT_KEY_TRANSFORM'] ?? 'TRF',
    'AI & Innovation': process.env['JIRA_PROJECT_KEY_AI_INNOVATION'] ?? 'AIINN',
    Academy: process.env['JIRA_PROJECT_KEY_ACADEMY'] ?? 'ACA',
    'Identity & Payments': process.env['JIRA_PROJECT_KEY_IDENTITY_PAYMENTS'] ?? 'IAP',
  };

  if (!raw) {
    return defaults;
  }

  const parsed: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const colonIdx = pair.lastIndexOf(':');
    if (colonIdx > 0) {
      const teamName = pair.slice(0, colonIdx).trim();
      const projectKey = pair.slice(colonIdx + 1).trim();
      if (teamName && projectKey) {
        parsed[teamName] = projectKey;
      }
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : defaults;
}

export const config = {
  jira: {
    baseUrl: requireEnv('JIRA_BASE_URL'),
    userEmail: requireEnv('JIRA_USER_EMAIL'),
    apiToken: requireEnv('JIRA_API_TOKEN'),
    projectKey: process.env['JIRA_PROJECT_KEY'] ?? 'PF',
    /** Map of team name → Jira project key for the five delivery teams */
    teamProjectKeys: parseTeamProjectKeys(),
    /**
     * Custom field ID on Product Feedback tickets that stores the owning team name.
     * Since tickets live in the Product Feedback project (not team projects), the
     * team is derived from this custom field rather than from the project key.
     * Configurable via JIRA_FIELD_TEAM. Default: "customfield_10060".
     */
    teamFieldId: process.env['JIRA_FIELD_TEAM'] ?? 'customfield_10060',
  },
  anthropic: {
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
  },
  slack: {
    botToken: requireEnv('SLACK_BOT_TOKEN'),
    channel: process.env['SLACK_CHANNEL'] ?? '#shin-test-space',
    /** Product Ops routing — Slack user IDs by person */
    productOps: {
      darshini: process.env['SLACK_USER_DARSHINI'] ?? '',
      bryan: process.env['SLACK_USER_BRYAN'] ?? '',
      jinChoy: process.env['SLACK_USER_JIN_CHOY'] ?? '',
    },
    /** Squad Lead routing — Slack user IDs by person */
    squadLeads: {
      sambruce: process.env['SLACK_USER_SAMBRUCE'] ?? '',
      palak: process.env['SLACK_USER_PALAK'] ?? '',
      natasha: process.env['SLACK_USER_NATASHA'] ?? '',
      amanda: process.env['SLACK_USER_AMANDA'] ?? '',
      suresh: process.env['SLACK_USER_SURESH'] ?? '',
    },
  },
  wontDo: {
    /** Impact score below this threshold is "low impact" — candidate for Won't Do */
    lowImpactThreshold: parseFloat(process.env['WONT_DO_LOW_IMPACT_THRESHOLD'] ?? '2.0'),
    /** State file for tracking pending approvals and reminder counts */
    statePath: process.env['WONT_DO_STATE_PATH'] ?? path.join(process.cwd(), 'state', 'wont-do-state.json'),
    /** Hours between reminders */
    reminderIntervalHours: parseInt(process.env['WONT_DO_REMINDER_INTERVAL_HOURS'] ?? '24', 10),
    /** Maximum number of reminders before the message is abandoned */
    maxReminders: parseInt(process.env['WONT_DO_MAX_REMINDERS'] ?? '3', 10),
  },
  /**
   * Weekly bug digest configuration.
   * Controls the cron schedule and audience routing.
   */
  weeklyDigest: {
    /**
     * Cron expression for Monday 8:00 AM.
     * Override via WEEKLY_DIGEST_CRON env var.
     */
    cronExpression: process.env['WEEKLY_DIGEST_CRON'] ?? '0 8 * * 1',
    /**
     * Timezone for the cron job.
     * Override via WEEKLY_DIGEST_TIMEZONE env var.
     */
    timezone: process.env['WEEKLY_DIGEST_TIMEZONE'] ?? 'Asia/Kuala_Lumpur',
    /**
     * Product Ops audience routing.
     * Each member covers a set of teams (by team name, case-insensitive substring match).
     */
    audienceRouting: {
      darshini: ['academy', 'engage'],
      bryan: ['identity', 'payment'],
      jinChoy: ['ai', 'innovation', 'transform'],
    },
  },
  /**
   * Monthly feature digest configuration.
   * Controls the Confluence integration for quarterly pages.
   */
  confluence: {
    baseUrl: process.env['CONFLUENCE_BASE_URL'] ?? '',
    userEmail: process.env['CONFLUENCE_USER_EMAIL'] ?? '',
    apiToken: process.env['CONFLUENCE_API_TOKEN'] ?? '',
    spaceKey: process.env['CONFLUENCE_SPACE_KEY'] ?? 'PM',
  },
  /**
   * Quarterly adoption check configuration.
   * The adoption check runs once per quarter (Jan, Apr, Jul, Oct).
   */
  quarterlyAdoption: {
    /**
     * Cron expression for the first Monday of Jan, Apr, Jul, Oct at 8:00 AM.
     * Override via QUARTERLY_ADOPTION_CRON env var.
     * Default: "0 8 1-7 1,4,7,10 1"
     */
    cronExpression: process.env['QUARTERLY_ADOPTION_CRON'] ?? '0 8 1-7 1,4,7,10 1',
  },
  /** Express server port for Slack interaction webhook */
  serverPort: parseInt(process.env['PORT'] ?? '3000', 10),
  similarityThreshold: parseFloat(process.env['SIMILARITY_THRESHOLD'] ?? '0.80'),
  runStatePath: process.env['RUN_STATE_PATH'] ?? path.join(process.cwd(), '.run-state.json'),
  runLogPath: process.env['RUN_LOG_PATH'] ?? path.join(process.cwd(), 'logs', 'run-log.jsonl'),

  /**
   * Impact Score configuration.
   * The Impact Score formula: linkedTicketCount × customerSegmentWeight × aiSeverity
   * All three values come from Jira custom fields on the ticket.
   * Field IDs are read from env vars so they can be configured per Jira instance.
   */
  impactScore: {
    /**
     * Custom field ID for "Customer Segment Weight" (numeric, e.g. customfield_10050).
     * Read from JIRA_FIELD_CUSTOMER_SEGMENT_WEIGHT.
     */
    customerSegmentWeightFieldId:
      process.env['JIRA_FIELD_CUSTOMER_SEGMENT_WEIGHT'] ?? 'customfield_10050',
    /**
     * Custom field ID for "AI Severity" (numeric, e.g. customfield_10051).
     * Read from JIRA_FIELD_AI_SEVERITY.
     */
    aiSeverityFieldId:
      process.env['JIRA_FIELD_AI_SEVERITY'] ?? 'customfield_10051',
    /**
     * Threshold above which a priority-bump recommendation is surfaced.
     * Configurable via IMPACT_SCORE_BUMP_THRESHOLD. Default: 10.
     */
    priorityBumpThreshold: parseFloat(
      process.env['IMPACT_SCORE_BUMP_THRESHOLD'] ?? '10'
    ),
    /**
     * Work item priorities considered "too low" for the given Impact Score,
     * triggering a bump recommendation. Listed highest-to-lowest priority level.
     * Configurable via IMPACT_SCORE_BUMP_BELOW_PRIORITY (comma-separated).
     * Default: "Low,Lowest"
     */
    bumpBelowPriorities: (
      process.env['IMPACT_SCORE_BUMP_BELOW_PRIORITY'] ?? 'Low,Lowest'
    )
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
    /** Number of top groups to surface per team for digest consumption. */
    topNPerTeam: parseInt(process.env['IMPACT_SCORE_TOP_N'] ?? '5', 10),
  },
};
