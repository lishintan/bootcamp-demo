import axios, { AxiosInstance } from 'axios';
import { config } from '../config/index.js';

export interface JiraTicket {
  id: string;
  key: string;
  summary: string;
  description: string | null;
  labels: string[];
  reporter: {
    accountId: string;
    displayName: string;
  };
  created: string; // ISO 8601
  issueType: string;
  status: string;
  priority: string | null;
  customFields: Record<string, unknown>;
}

export interface JiraIssueLink {
  type: {
    name: string;
    inward: string;
    outward: string;
  };
  inwardIssue?: { key: string };
  outwardIssue?: { key: string };
}

/**
 * A simplified Jira issue record returned by getLinkedDeliveryTickets().
 * Contains only the fields needed to assess delivery ticket status.
 */
export interface JiraIssue {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  /** Status category name, e.g. "To Do", "In Progress", "Done" */
  statusCategoryName: string;
  /** Status category key, e.g. "new", "indeterminate", "done" */
  statusCategoryKey: string;
}

export interface IssueLinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
}

export class JiraClient {
  private http: AxiosInstance;

  constructor() {
    const auth = Buffer.from(
      `${config.jira.userEmail}:${config.jira.apiToken}`
    ).toString('base64');

    this.http = axios.create({
      baseURL: `${config.jira.baseUrl}/rest/api/3`,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Fetch all Parking Lot tickets from the Product Feedback project.
   * Uses pagination to retrieve the full result set.
   */
  async getParkingLotTickets(since?: Date): Promise<JiraTicket[]> {
    const projectKey = config.jira.projectKey;
    let jql = `project = "${projectKey}" AND status = "Parking Lot" ORDER BY created ASC`;

    if (since) {
      // Jira date format for JQL
      const sinceStr = since.toISOString().slice(0, 10).replace(/-/g, '-');
      jql = `project = "${projectKey}" AND status = "Parking Lot" AND created >= "${sinceStr}" ORDER BY created ASC`;
    }

    const tickets: JiraTicket[] = [];
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const response = await this.http.get('/search', {
        params: {
          jql,
          startAt,
          maxResults,
          fields: [
            'summary',
            'description',
            'labels',
            'reporter',
            'created',
            'issuetype',
            'status',
            'priority',
            'issuelinks',
          ].join(','),
        },
      });

      const data = response.data as {
        issues: Array<{
          id: string;
          key: string;
          fields: {
            summary: string;
            description: { content?: Array<{ content?: Array<{ text?: string }> }> } | null;
            labels: string[];
            reporter: { accountId: string; displayName: string };
            created: string;
            issuetype: { name: string };
            status: { name: string };
            priority: { name: string } | null;
          };
        }>;
        total: number;
        startAt: number;
        maxResults: number;
      };

      for (const issue of data.issues) {
        tickets.push({
          id: issue.id,
          key: issue.key,
          summary: issue.fields.summary,
          description: this.extractTextFromAdf(issue.fields.description),
          labels: issue.fields.labels ?? [],
          reporter: {
            accountId: issue.fields.reporter.accountId,
            displayName: issue.fields.reporter.displayName,
          },
          created: issue.fields.created,
          issueType: issue.fields.issuetype.name,
          status: issue.fields.status.name,
          priority: issue.fields.priority?.name ?? null,
          customFields: {},
        });
      }

      startAt += data.issues.length;
      if (startAt >= data.total || data.issues.length === 0) {
        break;
      }
    }

    return tickets;
  }

  /**
   * Extract plain text from Jira's Atlassian Document Format (ADF).
   */
  private extractTextFromAdf(
    adf: { content?: Array<{ content?: Array<{ text?: string }> }> } | null
  ): string | null {
    if (!adf) return null;

    const texts: string[] = [];

    function walk(node: unknown): void {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (typeof n['text'] === 'string') {
        texts.push(n['text']);
      }
      if (Array.isArray(n['content'])) {
        for (const child of n['content']) {
          walk(child);
        }
      }
    }

    walk(adf);
    return texts.join(' ').trim() || null;
  }

  /**
   * Fetch available issue link types.
   */
  async getIssueLinkTypes(): Promise<IssueLinkType[]> {
    const response = await this.http.get('/issueLinkType');
    const data = response.data as { issueLinkTypes: IssueLinkType[] };
    return data.issueLinkTypes;
  }

  /**
   * Create a parent-child Jira link between two tickets.
   * Uses the "Cloners" or "Problem/Incident" link type if "Parent-Child" is unavailable.
   * Convention: outwardIssue = child, inwardIssue = parent.
   */
  async createParentChildLink(
    parentKey: string,
    childKey: string,
    linkTypeName: string = 'Cloners'
  ): Promise<void> {
    await this.http.post('/issueLink', {
      type: { name: linkTypeName },
      inwardIssue: { key: parentKey },
      outwardIssue: { key: childKey },
    });
  }

  /**
   * Get existing issue links for a ticket.
   */
  async getIssueLinks(issueKey: string): Promise<JiraIssueLink[]> {
    const response = await this.http.get(`/issue/${issueKey}`, {
      params: { fields: 'issuelinks' },
    });
    const data = response.data as {
      fields: { issuelinks: JiraIssueLink[] };
    };
    return data.fields.issuelinks ?? [];
  }

  /**
   * Add a label to a Jira ticket.
   */
  async addLabel(issueKey: string, label: string): Promise<void> {
    const response = await this.http.get(`/issue/${issueKey}`, {
      params: { fields: 'labels' },
    });
    const currentLabels: string[] = (response.data as { fields: { labels: string[] } }).fields.labels ?? [];

    if (!currentLabels.includes(label)) {
      await this.http.put(`/issue/${issueKey}`, {
        fields: { labels: [...currentLabels, label] },
      });
    }
  }

  /**
   * Fetch all open/active issues from a given Jira project (delivery team project).
   * Returns summary, description, status, priority, and selected custom fields.
   * Uses pagination to retrieve the full result set.
   */
  async getDeliveryProjectTickets(
    projectKey: string,
    customFieldIds: string[] = []
  ): Promise<JiraTicket[]> {
    const jql = `project = "${projectKey}" AND statusCategory != Done ORDER BY created ASC`;

    const standardFields = [
      'summary',
      'description',
      'labels',
      'reporter',
      'created',
      'issuetype',
      'status',
      'priority',
      'issuelinks',
    ];

    const allFields = [...standardFields, ...customFieldIds];

    const tickets: JiraTicket[] = [];
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const response = await this.http.get('/search', {
        params: {
          jql,
          startAt,
          maxResults,
          fields: allFields.join(','),
        },
      });

      type IssueFields = {
        summary: string;
        description: { content?: Array<{ content?: Array<{ text?: string }> }> } | null;
        labels: string[];
        reporter: { accountId: string; displayName: string };
        created: string;
        issuetype: { name: string };
        status: { name: string };
        priority: { name: string } | null;
        [key: string]: unknown;
      };

      const data = response.data as {
        issues: Array<{ id: string; key: string; fields: IssueFields }>;
        total: number;
        startAt: number;
        maxResults: number;
      };

      for (const issue of data.issues) {
        const customFields: Record<string, unknown> = {};
        for (const fieldId of customFieldIds) {
          customFields[fieldId] = issue.fields[fieldId] ?? null;
        }

        tickets.push({
          id: issue.id,
          key: issue.key,
          summary: issue.fields.summary,
          description: this.extractTextFromAdf(issue.fields.description),
          labels: issue.fields.labels ?? [],
          reporter: {
            accountId: issue.fields.reporter?.accountId ?? '',
            displayName: issue.fields.reporter?.displayName ?? '',
          },
          created: issue.fields.created,
          issueType: issue.fields.issuetype.name,
          status: issue.fields.status.name,
          priority: issue.fields.priority?.name ?? null,
          customFields,
        });
      }

      startAt += data.issues.length;
      if (startAt >= data.total || data.issues.length === 0) {
        break;
      }
    }

    return tickets;
  }

  /**
   * Create a bidirectional "Relates to" link between two issues.
   * In Jira, a single issueLink record is inherently bidirectional (visible on both issues).
   * This method creates one link record; Jira displays it on both ends.
   * Uses the provided link type name, defaulting to "Relates".
   */
  async createBidirectionalLink(
    issueKeyA: string,
    issueKeyB: string,
    linkTypeName: string = 'Relates'
  ): Promise<void> {
    await this.http.post('/issueLink', {
      type: { name: linkTypeName },
      inwardIssue: { key: issueKeyA },
      outwardIssue: { key: issueKeyB },
    });
  }

  /**
   * Check whether a link between issueKeyA and issueKeyB already exists.
   * Checks from the perspective of issueKeyA's link list.
   */
  async linkExists(issueKeyA: string, issueKeyB: string): Promise<boolean> {
    const links = await this.getIssueLinks(issueKeyA);
    return links.some((link) => {
      return (
        link.inwardIssue?.key === issueKeyB ||
        link.outwardIssue?.key === issueKeyB
      );
    });
  }

  /**
   * Fetch the raw fields for a single Jira issue (returns the full fields object).
   * Used by Sprint 3 for sprint-lock checking.
   */
  async getIssueRawFields(issueKey: string, fields: string[]): Promise<Record<string, unknown>> {
    const response = await this.http.get(`/issue/${issueKey}`, {
      params: { fields: fields.join(',') },
    });
    const data = response.data as { fields: Record<string, unknown> };
    return data.fields;
  }

  /**
   * Fetch all available transitions for a Jira issue.
   */
  async getTransitions(issueKey: string): Promise<Array<{ id: string; name: string; to: { statusCategory: { key: string } } }>> {
    const response = await this.http.get(`/issue/${issueKey}/transitions`);
    const data = response.data as {
      transitions: Array<{ id: string; name: string; to: { statusCategory: { key: string } } }>;
    };
    return data.transitions;
  }

  /**
   * Transition a Jira issue to a new status using the transition ID.
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.http.post(`/issue/${issueKey}/transitions`, {
      transition: { id: transitionId },
    });
  }

  /**
   * Find the transition ID that leads to a status whose name matches (case-insensitive).
   * Returns null if no such transition exists.
   */
  async findTransitionId(issueKey: string, targetStatusName: string): Promise<string | null> {
    const transitions = await this.getTransitions(issueKey);
    const found = transitions.find(
      (t) => t.name.toLowerCase() === targetStatusName.toLowerCase()
    );
    return found?.id ?? null;
  }

  /**
   * Fetch the linked issues on a parent ticket that are delivery-related.
   *
   * "Delivery-related" means the link type is NOT a pure grouping link
   * (i.e. does not contain "clone" or "cloner" in the link type name).
   * This distinguishes the internal parent-child grouping links created by
   * the Sprint 1 engine from external delivery-project links.
   *
   * Returns the linked JiraTickets (one API call per linked issue to get status).
   */
  async getLinkedDeliveryTickets(parentKey: string): Promise<JiraIssue[]> {
    const response = await this.http.get(`/issue/${parentKey}`, {
      params: { fields: 'issuelinks' },
    });

    const data = response.data as {
      fields: {
        issuelinks: Array<{
          type: { name: string; inward: string; outward: string };
          inwardIssue?: { key: string; fields?: { status?: { name: string; statusCategory?: { name: string; key: string } } } };
          outwardIssue?: { key: string; fields?: { status?: { name: string; statusCategory?: { name: string; key: string } } } };
        }>;
      };
    };

    const links = data.fields.issuelinks ?? [];
    const deliveryIssues: JiraIssue[] = [];

    for (const link of links) {
      const linkTypeName = link.type.name.toLowerCase();
      // Skip grouping links (clone/cloner links are the internal parent-child links)
      if (linkTypeName.includes('clone') || linkTypeName.includes('cloner')) {
        continue;
      }

      // Collect the linked issue key (either inward or outward)
      const linkedIssueKey =
        link.outwardIssue?.key ?? link.inwardIssue?.key;

      if (!linkedIssueKey) continue;

      try {
        // Fetch the status of the linked issue
        const issueResponse = await this.http.get(`/issue/${linkedIssueKey}`, {
          params: { fields: 'status,summary,issuetype' },
        });

        const issueData = issueResponse.data as {
          key: string;
          fields: {
            summary: string;
            issuetype: { name: string };
            status: {
              name: string;
              statusCategory: { name: string; key: string };
            };
          };
        };

        deliveryIssues.push({
          key: issueData.key,
          summary: issueData.fields.summary,
          issueType: issueData.fields.issuetype.name,
          status: issueData.fields.status.name,
          statusCategoryName: issueData.fields.status.statusCategory.name,
          statusCategoryKey: issueData.fields.status.statusCategory.key,
        });
      } catch (err) {
        console.warn(
          `[JIRA] getLinkedDeliveryTickets: could not fetch linked issue ${linkedIssueKey}: ${err}`
        );
      }
    }

    return deliveryIssues;
  }

  /**
   * Return the status category name for a Jira issue.
   * Common values: "To Do", "In Progress", "Done"
   */
  async getIssueStatus(key: string): Promise<string> {
    const response = await this.http.get(`/issue/${key}`, {
      params: { fields: 'status' },
    });

    const data = response.data as {
      fields: {
        status: {
          name: string;
          statusCategory: { name: string; key: string };
        };
      };
    };

    return data.fields.status.statusCategory.name;
  }

  /**
   * Fetch all Product Feedback parent tickets that have at least one issue link.
   * Uses JQL: project = "<projectKey>" AND issuetype in (Idea) AND issueLinks is not EMPTY
   *
   * These are the parent tickets created by the grouping engine. Paginated.
   */
  async fetchProductFeedbackParentTickets(): Promise<JiraTicket[]> {
    const projectKey = config.jira.projectKey;
    const jql =
      `project = "${projectKey}" AND issuetype in (Idea) AND issueLinks is not EMPTY ORDER BY created ASC`;

    const tickets: JiraTicket[] = [];
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const response = await this.http.get('/search', {
        params: {
          jql,
          startAt,
          maxResults,
          fields: [
            'summary',
            'description',
            'labels',
            'reporter',
            'created',
            'issuetype',
            'status',
            'priority',
            'issuelinks',
          ].join(','),
        },
      });

      const data = response.data as {
        issues: Array<{
          id: string;
          key: string;
          fields: {
            summary: string;
            description: { content?: Array<{ content?: Array<{ text?: string }> }> } | null;
            labels: string[];
            reporter: { accountId: string; displayName: string };
            created: string;
            issuetype: { name: string };
            status: { name: string };
            priority: { name: string } | null;
          };
        }>;
        total: number;
        startAt: number;
        maxResults: number;
      };

      for (const issue of data.issues) {
        tickets.push({
          id: issue.id,
          key: issue.key,
          summary: issue.fields.summary,
          description: this.extractTextFromAdf(issue.fields.description),
          labels: issue.fields.labels ?? [],
          reporter: {
            accountId: issue.fields.reporter?.accountId ?? '',
            displayName: issue.fields.reporter?.displayName ?? '',
          },
          created: issue.fields.created,
          issueType: issue.fields.issuetype.name,
          status: issue.fields.status.name,
          priority: issue.fields.priority?.name ?? null,
          customFields: {},
        });
      }

      startAt += data.issues.length;
      if (startAt >= data.total || data.issues.length === 0) {
        break;
      }
    }

    return tickets;
  }

  /**
   * Fetch a single Jira issue with specified fields.
   */
  async getIssue(issueKey: string, fields: string[]): Promise<JiraTicket> {
    const response = await this.http.get(`/issue/${issueKey}`, {
      params: { fields: fields.join(',') },
    });

    type IssueFields = {
      summary: string;
      description: { content?: Array<{ content?: Array<{ text?: string }> }> } | null;
      labels: string[];
      reporter: { accountId: string; displayName: string };
      created: string;
      issuetype: { name: string };
      status: { name: string };
      priority: { name: string } | null;
      [key: string]: unknown;
    };

    const data = response.data as { id: string; key: string; fields: IssueFields };
    const customFields: Record<string, unknown> = {};
    const standardFieldNames = new Set([
      'summary', 'description', 'labels', 'reporter',
      'created', 'issuetype', 'status', 'priority', 'issuelinks',
    ]);

    for (const fieldId of fields) {
      if (!standardFieldNames.has(fieldId)) {
        customFields[fieldId] = data.fields[fieldId] ?? null;
      }
    }

    return {
      id: data.id,
      key: data.key,
      summary: data.fields.summary,
      description: this.extractTextFromAdf(data.fields.description),
      labels: data.fields.labels ?? [],
      reporter: {
        accountId: data.fields.reporter?.accountId ?? '',
        displayName: data.fields.reporter?.displayName ?? '',
      },
      created: data.fields.created,
      issueType: data.fields.issuetype.name,
      status: data.fields.status.name,
      priority: data.fields.priority?.name ?? null,
      customFields,
    };
  }
}
