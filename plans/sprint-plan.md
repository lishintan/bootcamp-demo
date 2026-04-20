# Sprint Plan — Product Intelligence Dashboard

Generated: 2026-04-18
PRD: [product-intelligence-dashboard.md](../prd/product-intelligence-dashboard.md)

---

## Sprint 1 — Data Pipelines & App Shell

**Goal:** A running web app connected to Jira and Airtable with working tab navigation and user identity selection.

**Scope:**
- Next.js web app scaffolded and runnable locally
- Jira integration: fetch all Product Feedback board tickets with Parking Lot and Won't Do statuses
- Airtable integration: fetch user list (Division = Product & Creatives, Preferred Name) and customer research data
- Two-tab navigation: Insights and Who Are Our Customers
- Landing homepage: two visual cards + user identity dropdown
- Single user quote on the homepage (selected as most comprehensive/clear from Jira raw feedback)

**Acceptance Criteria:**
1. Visiting the app URL shows a landing page with two visual cards labelled "Insights" and "Who Are Our Customers"
2. A user identity dropdown is visible on every page and populated with names from the Product & Creatives division sourced from Airtable
3. Selecting a name from the dropdown persists the selection for the duration of the session
4. Clicking the "Insights" card or tab navigates to the Insights section
5. Clicking the "Who Are Our Customers" card or tab navigates to that section
6. The currently active tab is visually distinct from the inactive tab in the navigation
7. A single user quote appears below the two cards on the landing page
8. The app has fetched and loaded all Parking Lot and Won't Do tickets from the Jira Product Feedback board (visible as raw data or confirmed by a ticket count)
9. The app has fetched and loaded customer research records from Airtable (visible as raw data or confirmed by a record count)

**Dependencies:** None — this is the foundation sprint.

---

## Sprint 2 — Semantic Clustering & Temperature Scoring

**Goal:** Jira tickets are automatically grouped into semantically coherent insight clusters with Temperature scores and AI-generated metadata computed for each group.

**Scope:**
- Semantic clustering: group tickets with ≥80% similarity on raw feedback + summary fields
- Separate clustering pools for Bug-category and Feedback-category tickets
- Temperature calculation: weighted score (Frequency 40%, Impact Score 30%, Recency 30%)
- Temperature tiering: Hot (top 30%), Medium (31–70%), Cold (bottom 29%)
- AI-generated Hook per insight group (1-sentence summary or best representative quote)
- Why Tag classification per group: Friction, Delight, Retention, or Revenue

**Acceptance Criteria:**
1. Two or more tickets with clearly similar raw feedback content appear as a single insight group rather than as separate entries
2. A ticket whose content is clearly unrelated to any other ticket remains its own standalone group — it is not force-merged
3. Each insight group shows a frequency count equal to the number of tickets in that group
4. Every insight group displays a Temperature badge: Hot, Medium, or Cold
5. The groups with the highest weighted scores in the current dataset are labelled Hot; the middle band Medium; the lowest labelled Cold
6. Each insight group displays a one-sentence Hook that captures the core signal of the grouped tickets
7. Each insight group displays exactly one Why Tag: Friction, Delight, Retention, or Revenue
8. A Bug-category ticket and a Feedback-category ticket never appear in the same insight group
9. The Recency signal for a group reflects the creation date of the most recently submitted ticket in that group, not an average

**Dependencies:** Sprint 1 (Jira ticket data must be fetched and available)

---

## Sprint 3 — Insights View

**Goal:** Users can filter insights by team, browse 16 insight cards split by category and ranked by Temperature, and switch between Open Insights and Deprioritized tabs.

**Scope:**
- Team filter screen with 6 team tiles and a Skip option
- Default 16-card grid: 8 Bug (top row) + 8 Feedback (bottom row) ranked by Temperature within each category
- Open Insights tab (Parking Lot tickets) and Deprioritized tab (Won't Do tickets)
- "Show All" paginated view per category row
- Full insight card with all specified fields

**Acceptance Criteria:**
1. Entering the Insights section shows a team filter screen with 6 labelled team tiles before any cards are displayed
2. Selecting one or more team tiles filters all insight cards to show only insights for those teams
3. Clicking "Skip" at the bottom right of the filter screen bypasses team selection and shows insights across all teams
4. The default insight view shows up to 8 Bug insight cards in a top row and up to 8 Feedback insight cards in a bottom row
5. Within each row, cards are ordered from highest to lowest Temperature score (Hot cards appear first)
6. Each card visibly displays: Hook, Source badge (from Jira Label field), Frequency count, Why Tag, Temperature badge, Feature Name, Team Name, and Category (Bug or Feedback)
7. A "Show All" control below each row opens a paginated list of all insights in that category for the current team selection
8. The "Open Insights" tab shows only insights derived from Parking Lot tickets
9. The "Deprioritized" tab shows only insights derived from Won't Do tickets; switching tabs immediately updates the displayed cards

**Dependencies:** Sprint 2 (insight groups and Temperature scores must be computed)

---

## Sprint 4 — Insight Detail View

**Goal:** Clicking an insight card reveals a rich detail view with an AI-generated narrative, temperature signal breakdown, and a hyperlinked ticket list.

**Scope:**
- Overlay/modal or slide-in panel opened from any insight card
- AI-generated narrative: problem statement, hypothesized cause, impact of not solving
- Conditional AI Summary for groups with 50+ tickets
- Temperature breakdown: per-signal values (frequency count, impact score, recency date)
- Hyperlinked Ticket List: each ticket ID opens the corresponding Jira ticket in a new tab
- Feature Name and Team Name labels in the detail view

**Acceptance Criteria:**
1. Clicking any insight card opens a detail view without navigating away from the current page
2. The detail view shows an AI-generated narrative that addresses: what the problem is, what likely causes it, and what the impact of not solving it would be
3. The detail view shows a Temperature section listing three values: frequency count, impact score, and the date of the most recent ticket in the group
4. The detail view lists all Jira ticket IDs belonging to the insight group
5. Clicking any ticket ID in the list opens that specific Jira ticket in a new browser tab, not the same tab
6. For insight groups containing 50 or more tickets, an "AI Summary" section appears with a concise TL;DR of the common sentiment across all tickets
7. For insight groups containing fewer than 50 tickets, no AI Summary section is shown
8. Feature Name and Team Name are displayed as visible labels in the detail view
9. The detail view can be dismissed to return to the insight cards grid

**Dependencies:** Sprint 3 (insight cards must be rendered and clickable)

---

## Sprint 5 — Bookmarks

**Goal:** Users can bookmark insights for their team, view and filter their team's active bookmarks, and access archived (removed) bookmarks.

**Scope:**
- Bookmark action on insight card and in insight detail view
- Bookmarked Insights section below the 16 insight cards on both tabs
- Team-scoped visibility with optional team filter dropdown
- Open / Archived toggle
- Bookmark metadata: insight title, date bookmarked, bookmarked-by name

**Acceptance Criteria:**
1. A bookmark icon is visible on each insight card and within the insight detail view
2. Clicking the bookmark icon when a user identity is selected saves the bookmark; the icon changes state to indicate the insight is bookmarked
3. Attempting to bookmark an insight without a user identity selected prompts the user to first choose their name from the dropdown
4. A "Bookmarked Insights" section appears below the insight card grid on both the Open Insights and Deprioritized tabs
5. When a team filter is active, the Bookmarks section shows only bookmarks associated with that team; when no team filter is active, a team dropdown filter appears within the Bookmarks section
6. Each bookmark entry displays the insight title, the date it was bookmarked, and the name of who bookmarked it
7. Clicking "Remove" on a bookmark moves it to Archived state — it disappears from the default Open view but is not deleted
8. An "Archived" toggle within the Bookmarks section reveals all previously removed bookmarks
9. Two users who select the same team see the same list of bookmarks for that team
10. The Bookmarked Insights section is absent from the "Who Are Our Customers" page

**Dependencies:** Sprint 3 (insight cards must be rendered to bookmark from)

---

## Sprint 6 — Who Are Our Customers

**Goal:** The "Who Are Our Customers" tab shows interactive customer profile charts that update when toggling between membership segments.

**Scope:**
- Membership segment toggle: Premium Programs (Academy) vs Mindvalley Membership
- Interactive charts for 7 customer attributes from Airtable
- Data source: Airtable `appIZJp8z2zpV5o6D`, table `tblJ7EuapVwmSZc9N`, view `viw5DPImCMPKkkmrv`

**Acceptance Criteria:**
1. Clicking the "Who Are Our Customers" tab displays the customer profile page
2. Two segment toggles appear at the top of the page: "Premium Programs" and "Mindvalley Membership"
3. Selecting a segment updates all charts on the page to reflect data only for that membership segment
4. The page displays charts or visual distributions for all 7 customer attributes: Age, Life Stage, Job/Profession, Motivation to Join Mindvalley, Tech Literacy/Savviness, Device Preference, and Membership Type
5. Each chart shows a non-empty distribution when records exist in Airtable for the selected segment
6. Hovering over a chart element displays the count or percentage for that specific data point
7. The Bookmarked Insights section is not present on this page
8. Switching to this page when a team filter is active in the Insights tab does not apply that filter to the customer profile data

**Dependencies:** Sprint 1 (Airtable customer research data must be fetched and available)

---

## Dependency Graph

```
Sprint 1 (Data Pipelines & App Shell)
    │
    ├──► Sprint 2 (Semantic Clustering & Temperature)
    │         │
    │         └──► Sprint 3 (Insights View)
    │                   │
    │                   ├──► Sprint 4 (Insight Detail View)
    │                   │
    │                   └──► Sprint 5 (Bookmarks)
    │
    └──► Sprint 6 (Who Are Our Customers)
              [depends only on Sprint 1; scheduled after Sprint 5 in sequential execution]
```

**Critical path:** Sprint 1 → 2 → 3 → 4 → 5 → 6

Each sprint produces a visibly richer running app. Sprint 1 delivers a connected shell. Sprint 2 adds intelligence. Sprint 3 makes insights browsable. Sprint 4 adds depth. Sprint 5 adds team workflow. Sprint 6 completes the customer understanding layer.
