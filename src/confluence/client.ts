/**
 * Confluence REST API v2 Client
 *
 * Sprint 5: Quarterly Confluence page management for monthly feature digests.
 *
 * Environment variables:
 *   CONFLUENCE_BASE_URL    — e.g. https://your-org.atlassian.net/wiki
 *   CONFLUENCE_USER_EMAIL  — same Atlassian account email as Jira
 *   CONFLUENCE_API_TOKEN   — Atlassian API token
 *   CONFLUENCE_SPACE_KEY   — Confluence space key (default: "PM")
 *
 * Page lifecycle:
 *   - First run of a new quarter: create a new page titled "Feedback Insights Q[Q] [YYYY]"
 *   - Subsequent monthly runs within the same quarter: fetch by title and append content
 *
 * The page body uses Confluence storage format (XHTML).
 */

import axios, { AxiosInstance } from 'axios';

export interface ConfluencePageSummary {
  id: string;
  title: string;
  version: number;
  spaceKey: string;
}

export class ConfluenceClient {
  private http: AxiosInstance;
  private spaceKey: string;
  private baseUrl: string;

  constructor() {
    const baseUrl = process.env['CONFLUENCE_BASE_URL'];
    const userEmail = process.env['CONFLUENCE_USER_EMAIL'];
    const apiToken = process.env['CONFLUENCE_API_TOKEN'];
    this.spaceKey = process.env['CONFLUENCE_SPACE_KEY'] ?? 'PM';

    if (!baseUrl || !userEmail || !apiToken) {
      throw new Error(
        'Confluence client requires CONFLUENCE_BASE_URL, CONFLUENCE_USER_EMAIL, ' +
        'and CONFLUENCE_API_TOKEN environment variables.'
      );
    }

    this.baseUrl = baseUrl.replace(/\/$/, '');

    const auth = Buffer.from(`${userEmail}:${apiToken}`).toString('base64');

    this.http = axios.create({
      baseURL: `${this.baseUrl}/wiki/api/v2`,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Search for a Confluence page by exact title within the configured space.
   * Returns the page summary (id, title, version) or null if not found.
   */
  async findPageByTitle(title: string): Promise<ConfluencePageSummary | null> {
    try {
      const response = await this.http.get('/pages', {
        params: {
          spaceKey: this.spaceKey,
          title,
          limit: 1,
          expand: 'version',
        },
      });

      const data = response.data as {
        results: Array<{
          id: string;
          title: string;
          version: { number: number };
          spaceKey?: string;
        }>;
      };

      if (data.results.length === 0) return null;

      const page = data.results[0]!;
      return {
        id: page.id,
        title: page.title,
        version: page.version.number,
        spaceKey: page.spaceKey ?? this.spaceKey,
      };
    } catch (err) {
      console.warn(`[CONFLUENCE] findPageByTitle error for "${title}": ${err}`);
      return null;
    }
  }

  /**
   * Get the full storage-format body of a Confluence page.
   */
  async getPageBody(pageId: string): Promise<string> {
    const response = await this.http.get(`/pages/${pageId}`, {
      params: { bodyFormat: 'storage', expand: 'body.storage,version' },
    });

    const data = response.data as {
      body?: { storage?: { value?: string } };
      version?: { number?: number };
    };

    return data.body?.storage?.value ?? '';
  }

  /**
   * Create a new Confluence page in the configured space.
   * Returns the new page ID.
   *
   * @param title - Page title
   * @param body - Confluence storage format (XHTML)
   */
  async createPage(title: string, body: string): Promise<string> {
    const response = await this.http.post('/pages', {
      spaceId: await this.getSpaceId(),
      status: 'current',
      title,
      body: {
        representation: 'storage',
        value: body,
      },
    });

    const data = response.data as { id: string };
    console.log(`[CONFLUENCE] Created page "${title}" (id=${data.id})`);
    return data.id;
  }

  /**
   * Update an existing Confluence page by appending new content to the body.
   * The existing body is fetched first, then the new content is appended.
   *
   * @param pageId - Confluence page ID
   * @param currentVersion - Current version number (must be incremented)
   * @param title - Page title (unchanged)
   * @param appendContent - New Confluence storage format XHTML to append
   */
  async appendToPage(
    pageId: string,
    currentVersion: number,
    title: string,
    appendContent: string
  ): Promise<void> {
    // Fetch current body
    const existingBody = await this.getPageBody(pageId);

    // Append new content
    const newBody = existingBody + '\n' + appendContent;

    await this.http.put(`/pages/${pageId}`, {
      id: pageId,
      status: 'current',
      title,
      version: { number: currentVersion + 1 },
      body: {
        representation: 'storage',
        value: newBody,
      },
    });

    console.log(`[CONFLUENCE] Updated page "${title}" (id=${pageId}, version=${currentVersion + 1})`);
  }

  /**
   * Derive the Confluence space numeric ID from the space key.
   * Required by the v2 API for page creation.
   */
  private async getSpaceId(): Promise<string> {
    const response = await this.http.get('/spaces', {
      params: { keys: this.spaceKey, limit: 1 },
    });

    const data = response.data as {
      results: Array<{ id: string; key: string }>;
    };

    if (data.results.length === 0) {
      throw new Error(
        `Confluence space with key "${this.spaceKey}" not found. ` +
        `Check CONFLUENCE_SPACE_KEY.`
      );
    }

    return data.results[0]!.id;
  }
}

// ── Quarterly Page Helpers ────────────────────────────────────────────────────

/**
 * Get the quarter number (1–4) for a given date.
 */
export function getQuarter(date: Date): number {
  return Math.ceil((date.getMonth() + 1) / 3);
}

/**
 * Build the Confluence page title for a given quarter and year.
 * Format: "Feedback Insights Q[Q] [YYYY]"
 */
export function buildQuarterlyPageTitle(date: Date): string {
  const q = getQuarter(date);
  const year = date.getFullYear();
  return `Feedback Insights Q${q} ${year}`;
}

/**
 * Build the Confluence storage format XHTML for a monthly digest summary.
 * This is appended to (or used as the initial body of) the quarterly page.
 *
 * @param monthLabel - e.g. "April 2026"
 * @param digestSummaries - Array of per-squad-lead summary strings
 */
export function buildMonthlyConfluenceBody(
  monthLabel: string,
  digestSummaries: string[]
): string {
  const sections = digestSummaries
    .map((s) => `<p>${escapeXml(s)}</p>`)
    .join('\n');

  return (
    `<h2>${escapeXml(monthLabel)} — Feature Digest Summary</h2>\n` +
    `<p><em>Generated on ${escapeXml(new Date().toISOString())}</em></p>\n` +
    sections +
    '\n<hr/>'
  );
}

/**
 * Escape special XML characters for Confluence storage format.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Ensure a quarterly Confluence page exists and append this month's digest.
 *
 * - If no page exists for this quarter → create it with this month's content
 *   (and optionally include the adoption count).
 * - If a page already exists → append this month's content to it.
 *
 * @param confluenceClient - ConfluenceClient instance
 * @param monthLabel - Human-readable month/year, e.g. "April 2026"
 * @param digestSummaries - Per-squad-lead digest summaries to include
 * @param runDate - Date of the monthly run (used to derive quarter/year)
 * @param adoptionCount - Optional quarterly adoption count (number of parent tickets
 *   with at least one Done delivery ticket). Included in the page only on creation.
 */
export async function upsertQuarterlyPage(
  confluenceClient: ConfluenceClient,
  monthLabel: string,
  digestSummaries: string[],
  runDate: Date = new Date(),
  adoptionCount?: number
): Promise<void> {
  const pageTitle = buildQuarterlyPageTitle(runDate);
  const monthlyBody = buildMonthlyConfluenceBody(monthLabel, digestSummaries);

  console.log(`[CONFLUENCE] Upserting quarterly page: "${pageTitle}"`);

  const existingPage = await confluenceClient.findPageByTitle(pageTitle);

  if (!existingPage) {
    // First run of this quarter — create the page and include the adoption count
    console.log(`[CONFLUENCE] No existing page for "${pageTitle}" — creating.`);

    let fullBody = monthlyBody;
    if (adoptionCount !== undefined) {
      const q = getQuarter(runDate);
      const year = runDate.getFullYear();
      const adoptionSection =
        `\n<h2>Q${q} ${year} Adoption Summary</h2>\n` +
        `<p>` +
        `Product Feedback tickets adopted (linked delivery ticket marked Done): ` +
        `<strong>${adoptionCount}</strong>` +
        `</p>\n` +
        `<p><em>Adoption count generated on ${escapeXml(new Date().toISOString())}</em></p>\n` +
        `<hr/>`;
      fullBody = monthlyBody + adoptionSection;
    }

    await confluenceClient.createPage(pageTitle, fullBody);
  } else {
    // Subsequent run — append this month's content
    console.log(
      `[CONFLUENCE] Existing page "${pageTitle}" (id=${existingPage.id}, version=${existingPage.version}) — appending.`
    );
    await confluenceClient.appendToPage(
      existingPage.id,
      existingPage.version,
      existingPage.title,
      monthlyBody
    );
  }
}
