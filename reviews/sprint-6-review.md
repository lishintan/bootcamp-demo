# Sprint 6 Review
**Verdict**: PASS
**Attempt**: 1 (with orchestrator fix applied during evaluation)

## Acceptance Criteria

### AC1: Clicking the "Who Are Our Customers" tab displays the customer profile page
**PASS** — `TopNav.tsx` defines a tab with label "Who Are Our Customers" linking to `/customers`. The route is registered in the Next.js build output as a static page (`○ /customers`). Clicking the tab navigates to `CustomersClient.tsx` which renders the full customer profile UI.

### AC2: Two segment toggles appear at the top of the page: "Premium Programs" and "Mindvalley Membership"
**PASS** — `CustomersClient.tsx` renders exactly two `<button>` elements labelled "Mindvalley Membership" and "Premium Programs" with correct `onClick` handlers setting `activeSegment` state. Both display a live count badge.

### AC3: Selecting a segment updates all charts on the page to reflect data only for that membership segment
**PASS** (Fix applied) — The `filteredRecords` memo correctly re-filters and recomputes distributions. Toggle wiring works. Classification logic fixed: `classifySegment` now takes `(segment, summary)` — Premium = `[Premium]` tag OR summary mentions "mastery/certification"; Membership = all others (Quest-only and Refunded moved to Membership bucket).

### AC4: The page displays charts or visual distributions for all 7 customer attributes: Age, Life Stage, Job/Profession, Motivation to Join Mindvalley, Tech Literacy/Savviness, Device Preference, and Membership Type
**PASS** — All 7 `AttributeChart` renders are present (lines 338–344 of `CustomersClient.tsx`):
- `Age`
- `Life Stage`
- `Job / Profession`
- `Motivation to Join Mindvalley`
- `Tech Literacy / Savviness`
- `Device Preference`
- `Membership Type`

### AC5: Each chart shows a non-empty distribution when records exist for the selected segment
**PASS** — `buildDistribution` correctly aggregates counts and percentages. When `filteredRecords.length > 0`, each attribute extractor always returns a string (never `undefined`), so every chart will have at least one bar. The `AttributeChart` component also handles the empty-data edge case gracefully with a "No data available" message.

### AC6: Hovering over a chart element displays the count or percentage for that specific data point
**PASS** — A `CustomTooltip` component (lines 161–174) is implemented and passed to the recharts `<Tooltip content={<CustomTooltip />} />`. It correctly reads `payload[0].payload.count` and `payload[0].payload.pct` and renders both: `"{count} customers ({pct}%)"`.

### AC7: The Bookmarked Insights section is not present on this page
**PASS** — A full-text search of `CustomersClient.tsx` and `customers/page.tsx` finds zero references to "bookmark", "Bookmark", or any bookmark UI components. The page imports no bookmark-related modules.

### AC8: Switching to this page when a team filter is active in the Insights tab does not apply that filter to the customer profile data
**PASS** — The Insights team filter (`teamFilter` state in `InsightsClient.tsx`) is a local `useState` scoped to the Insights client component. `CustomersClient.tsx` has no imports from Insights, no context providers, no URL query-param reads, and no global state. Navigating to `/customers` mounts a fresh component with entirely independent state.

---

## Quality Scores
- Functionality: 4/5
- Robustness: 4/5
- Integration: 4/5

## Notes
- Segment classification fixed (orchestrator): `classifySegment` updated to `(segment, summary)` signature. Quest-only and Refunded users now correctly go to Membership bucket. Mastery/Certification course purchasers detected via summary text → Premium.
- Known limitation: Only 50 of 363 total interview records in static file. Premium Programs bucket may be small. Will improve when Airtable PAT is upgraded to table-level read scope.
