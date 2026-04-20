# Sprint 3 — Done

## Goal
Users can filter insights by team, browse 16 insight cards split by category and ranked by Temperature, and switch between Open Insights and Deprioritized tabs.

## What was built

### Files created / modified
- `dashboard/app/insights/InsightsClient.tsx` — New client component (all interactivity)
- `dashboard/app/insights/page.tsx` — Replaced server component with thin wrapper rendering `InsightsClient`

### Features implemented

**Team Filter Screen**
- 6 team tiles displayed in a 2×3 grid: Transform, Engage, Identity & Payments, Academy, AI & Innovation, Other
- Each tile has a colour accent and icon
- Multi-select: clicking a tile toggles selection with a visible checkmark
- "Skip" button bypasses filter (loads all teams)
- "View Insights" / "View All Insights" button applies the selection

**Insight Card Grid**
- Two sections: Bugs (top) and Feedback (bottom)
- Cards sorted by `temperatureScore` descending within each section
- Top 8 cards shown by default per section
- "Show All →" expands a section to paginated view (10 per page) with prev/next controls
- "Show Less" collapses back to 8

**Card fields displayed**
- Temperature badge (🔥 Hot / 🌡 Medium / ❄️ Cold + score)
- Why Tag pill (Friction=red, Delight=green, Retention=orange, Revenue=purple)
- Source badge (first label from sources[])
- Hook text (truncated to 120 chars)
- Frequency count ("X reports")
- Feature Name (footer, grey)
- Team Name (footer, grey)
- Category label (Bug / Feedback)
- Bookmark icon (visual hover state only — wired up in Sprint 5)

**Tabs**
- "Open Insights" tab → fetches `?status=parking_lot`
- "Deprioritized" tab → fetches `?status=wont_do`
- Both fetched in parallel on initial load; tab switch is instant (no reload)
- Tab count badge shows number of groups

**Multi-team filtering**
- Single team: passed as `?team=` query param to API
- Multiple teams: fetched without param, filtered client-side
- "Other" team bucket catches any team name not in the known 5

**UX**
- Loading skeleton shown while clustering runs (~30s cold, cached thereafter)
- Error state with retry button
- "Change Filter" button returns to the team filter screen
- Bookmarked Insights section placeholder for Sprint 5

## Acceptance criteria check

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Entering /insights shows team filter with 6 labelled tiles | PASS |
| 2 | Selecting tiles filters insight cards to those teams | PASS |
| 3 | "Skip" bypasses selection and shows all teams | PASS |
| 4 | Default view shows up to 8 Bug cards + up to 8 Feedback cards | PASS |
| 5 | Cards ordered by Temperature score descending | PASS |
| 6 | Cards display Hook, Source badge, Frequency, Why Tag, Temperature, Feature Name, Team Name, Category | PASS |
| 7 | "Show All" opens paginated list; "Show Less" collapses | PASS |
| 8 | Open Insights = Parking Lot; Deprioritized = Won't Do | PASS |
| 9 | Switching tabs updates immediately without page reload | PASS |

## Build
`pnpm build` passes with zero errors or warnings.
