---
title: 'Product Intelligence Dashboard'
slug: 'product-intelligence-dashboard'
scope: product
status: resolved
parent: null
children:
  - product-intelligence-dashboard/insights-database-persistence.md
created: 2026-04-18
updated: 2026-04-18
resolution: 8/8
---

# Product Intelligence Dashboard

## Problem

Squad leads and Product Ops spend 1–2 hours weekly manually reviewing the Product Feedback Jira board — reading individual tickets, grouping similar ones by hand, and deciding what to prioritize or deprioritize. The process is entirely manual and the habit is inconsistent: when tickets pile up, PMs export CSVs and dump them into AI tools using different prompts, causing inconsistent insight quality. The CSV export strips raw feedback, losing nuance embedded in ticket descriptions. Each PM applies different grouping logic, so signal quality varies by team.

The result: high-value, recurring customer signals go unnoticed or are interpreted differently across teams.

## Vision

A division-wide interactive intelligence dashboard where product stakeholders can go from "open laptop" to "what customers are asking for" in under 3 minutes — without ever touching Jira directly. Tickets from the Product Feedback board are auto-grouped into insights by semantic similarity, scored by urgency (Temperature), and explorable by team. A companion view — "Who Are Our Customers" — gives context on the humans behind the signals, drawn from Airtable research data.

The dashboard does not replace human judgment. It removes the manual labour so that judgment is applied to the right decisions, not to sorting tickets.

## Users

**Squad Leads** (primary) — review their team's insights, bookmark items for follow-up, use insights to inform prioritization decisions. One per team.

| Squad Lead | Team |
|---|---|
| Sambruce Joseph | Transform |
| Palak Varma | Engage |
| Natasha Tomkinson | Identity & Payments |
| Amanda Shin | Academy |
| Suresh Sakadivan | AI & Innovation |

**Product Ops** (primary) — review team-specific bug signals and insights; same bookmark access as squad leads.

| Product Ops | Teams Covered |
|---|---|
| Darshini Mohanadass | Academy, Engage |
| Bryan Swee | Identity & Payments |
| Jin Choy Chew | AI & Innovation, Transform |

**Division-wide viewers** (secondary) — read-only access to all insights and customer data. Reference only, no bookmarking or action expected.

**Identity model:** Soft identity — users select their name from a dropdown populated from Airtable (`tblNQC1GROLrZLJYL`, filtered to Division = "Product & Creatives", using Preferred Name field). No login or authentication required.

## Core Capabilities

### 1. Homepage & Navigation

The dashboard has two top-level pages navigated via **tabs**:

- **Insights** — the customer feedback intelligence view
- **Who Are Our Customers** — the customer profile view

The landing state (before a tab is selected) shows two visual cards representing these two pages, with a single **user quote** pulled from Jira ticket raw feedback below them. Selection logic: the most comprehensive, clear, and easy-to-understand quote across all tickets — 1 quote displayed at a time. Clicking a card navigates to that tab.

---

### 2. Insights Flow

#### Step 1 — Team Filter Screen

On entering the Insights section, users see 6 team tiles (one per team). They may:
- Select one or more teams to filter the view
- Click **Skip** (bottom right) to see an unfiltered overview across all teams

#### Step 2 — Insight Cards (Open Insights / Deprioritized tabs)

Two tabs:
- **Open Insights** — tickets with Parking Lot status in Jira
- **Deprioritized** — tickets with Won't Do status in Jira

**Default view: 16 cards**, split by Jira `Category` field:
- **Top row (8 cards)** — Bug insights (Category = Bug)
- **Bottom row (8 cards)** — Feedback insights (Category = Feedback)

Each row shows the top 8 insights ranked by weighted Temperature score within that category. A **"Show All"** button opens a paginated view of all insights for the selected team(s) within that category.

**Each insight card shows:**
- **Hook**: 1-sentence AI-generated summary or a direct user quote representing the core of the grouped insight
- **Source badge**: derived from the Jira `Label` field — indicates what channel this feedback came from
- **Frequency**: count of unique tickets within the semantic group (e.g., "Mentioned by 12 customers")
- **Why Tag**: theme categorisation — Friction, Delight, Retention, or Revenue — derived by AI from grouped ticket content
- **Temperature badge**: Hot / Medium / Cold
- **Feature Name**: from the Jira Feature Name field
- **Team Name**: from the Jira Team Name field
- **Category**: Bug or Feedback (from Jira Category field)

**Temperature calculation:**

| Signal | Weight | Source |
|---|---|---|
| Frequency | 40% | Number of tickets in the semantic group |
| Impact Score | 30% | Existing Impact Score field in Jira |
| Recency | 30% | Created date of the most recent ticket in the group |

Scoring tiers (calculated across all insights within the current filtered view):
- **Hot** — top 30% of weighted scores
- **Medium** — 31st to 70th percentile
- **Cold** — bottom 29%

**Semantic grouping logic:**
Tickets are grouped by semantic similarity at runtime. The system reads the raw feedback and summary fields from Jira tickets and clusters tickets with ≥80% semantic similarity into a single insight group. Grouping is not based on label or feature name matching alone — meaning must be derived from content. The earliest ticket by creation date becomes the representative/parent of the group.

Source tickets: all Jira tickets in the **Product Feedback** board with status **Parking Lot** (for Open Insights) or **Won't Do** (for Deprioritized).

#### Step 3 — Insight Detail View

Clicking an insight card opens a detail view with:

- **Narrative** (AI-generated): A brief explanation of the problem, the hypothesized cause, and the impact of not solving it. Derived from the grouped tickets' raw feedback and summaries.
- **AI Summary** (conditional): If the insight group contains 50 or more tickets, an AI-generated TL;DR of the common sentiment across all tickets.
- **Temperature indicator**: Visual display of Hot / Medium / Cold with the breakdown of contributing signals (frequency count, impact score, recency date).
- **Ticket List**: A list of all Jira ticket IDs in the group, each hyperlinked to open the ticket in Jira in a new tab. No in-dashboard status changes.
- **Feature Name** and **Team Name** labels.

---

### 3. Bookmarks

Any user (after selecting their name from the dropdown) can bookmark an insight from the card or detail view.

**Location:** A **"Bookmarked Insights"** section appears below the 16 insight cards on the Open Insights and Deprioritized tabs. Not present on the "Who Are Our Customers" page.

**Filtering within Bookmarks:**
- If a team filter was selected in Step 1, bookmarks are pre-filtered to that team. Otherwise, a team filter dropdown is shown within the Bookmarks section.
- Toggle between **Open** (default) and **Archived** bookmarks.

**Bookmark behaviour:**
- Bookmarks are **team-scoped** — all users on the same team can see that team's bookmarks
- No strict identity enforcement — technically any user can see any team's bookmarks
- Each bookmark records: insight title, date bookmarked, name of who bookmarked it

**Bookmark states:**
- **Active** — currently bookmarked, visible by default
- **Archived** — removed bookmarks are moved to the Archived toggle view, not permanently deleted

---

### 4. Who Are Our Customers

Data source: Airtable `appIZJp8z2zpV5o6D`, table `tblJ7EuapVwmSZc9N`, view `viw5DPImCMPKkkmrv`.

**Filter**: Users toggle between two membership segments:
- **Premium Programs** (Academy)
- **Mindvalley Membership**

Each segment shows an interactive visual summary (charts/distributions) for the following customer attributes:
- Age
- Life stage
- Job / profession
- Motivation to join Mindvalley
- Tech literacy / savviness (openness to new tech and AI assistance)
- Device preference
- Membership type

## Boundaries

**In scope:**
- Jira data source: Product Feedback board (Parking Lot and Won't Do statuses)
- Airtable data sources: customer research table (`tblJ7EuapVwmSZc9N`) for "Who Are Our Customers"; user list table (`tblNQC1GROLrZLJYL`) for identity dropdown
- User identity: soft dropdown selection, no SSO or login
- Actions: bookmark only — no in-dashboard ticket status changes
- All Jira navigation via hyperlink (opens in new tab)

**Out of scope (v1):**
- Automated email or Slack delivery of insights
- In-dashboard ticket status changes (To Do, Won't Do, etc.)
- Prioritized tab (To Do / In Progress / Done tickets) — deferred
- Per-team Slack channel integration
- Jira projects outside the Product Feedback board

## Success Criteria

| Metric | Target |
|---|---|
| Time to first insight | < 3 minutes from opening the dashboard |
| Reduction in manual Jira processing | 1 hour saved per person per week |

## Open Questions

None.

## Epics

1. **Jira Data Pipeline** — fetch all Parking Lot and Won't Do tickets from the Product Feedback board; run semantic clustering (≥80% similarity) to produce insight groups; compute Temperature scores (Frequency 40%, Impact Score 30%, Recency 30%); expose a data layer the UI consumes
2. **Airtable Integration** — fetch the user list (`tblNQC1GROLrZLJYL`, Division = Product & Creatives) for the identity dropdown; fetch customer research data (`tblJ7EuapVwmSZc9N`, view `viw5DPImCMPKkkmrv`) for the Who Are Our Customers page
3. **App Shell & Navigation** — tabbed navigation between Insights and Who Are Our Customers; landing homepage with two visual cards and user quotes section; user identity dropdown (select preferred name)
4. **Insights View** — team filter screen (6 teams + Skip); 16-card default grid split by Category (8 Bug top row, 8 Feedback bottom row) ranked by Temperature; Show All paginated view; Open Insights and Deprioritized tabs
5. **Insight Detail View** — AI-generated narrative (problem + cause + impact); conditional AI summary for groups with 50+ tickets; Temperature breakdown; hyperlinked Ticket List
6. **Bookmarks** — team-scoped bookmarking from card and detail views; Bookmarked Insights section below insight cards with team filter and Open/Archived toggle; soft identity attribution (date + name)
7. **Who Are Our Customers** — Premium Programs / Mindvalley Membership toggle; interactive charts for 7 customer attributes drawn from Airtable
