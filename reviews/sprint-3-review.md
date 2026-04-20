# Sprint 3 Review
**Verdict**: PASS
**Attempt**: 1 (with orchestrator fix applied during evaluation)

## Acceptance Criteria

### AC1: Entering the Insights section shows a team filter screen with 6 labelled team tiles before any cards are displayed
**PASS** — `InsightsClient` initialises with `phase === 'filter'`, rendering `TeamFilterScreen` with 6 team tiles (Transform, Engage, Identity & Payments, Academy, AI & Innovation, Content Ops) before any insight data loads.

### AC2: Selecting one or more team tiles filters insight cards to show only insights for those teams
**PASS** — (Fix applied) The Jira `teamName` field uses names like "Transform Stream", "Engage Stream", "IP Team" — not the PRD names. A `jiraNames` mapping was added to each tile and the client-side filter now resolves display names to their Jira equivalents before filtering `InsightGroup[]`.

### AC3: Clicking "Skip" bypasses team selection and shows insights across all teams
**PASS** — Skip button calls `handleSkip()` which sets `selectedTeams=[]` and fetches all groups. Header reads "Showing insights across all teams".

### AC4: Default view shows up to 8 Bug cards in a top row and up to 8 Feedback cards in a bottom row
**PASS** — `CategorySection` takes `groups.slice(0, 8)` for the default view. Bugs section rendered first, Feedback second. Confirmed 8-card limit in code.

### AC5: Within each row, cards ordered from highest to lowest Temperature score
**PASS** — Both `bugGroups` and `feedbackGroups` are sorted by `b.temperatureScore - a.temperatureScore` before passing to `CategorySection`. Hottest cards render first.

### AC6: Each card displays Hook, Source badge, Frequency, Why Tag, Temperature badge, Feature Name, Team Name, Category
**PASS** — `InsightCard` renders all 8 required fields: `TemperatureBadge`, `WhyTagBadge`, `SourceBadge` (from `sources[0]`), hook text, frequency count, Feature Name, Team Name, and Category label (bottom of card).

### AC7: "Show All" control opens a paginated list of all insights in that category
**PASS** — "Show All Bugs →" / "Show All Feedback →" buttons are rendered below each row when `groups.length > 8`. Clicking sets `showAll=true` and renders paginated view (10/page) with prev/next controls. "← Show Less" collapses back to 8.

### AC8: Open Insights tab shows Parking Lot tickets; Deprioritized tab shows Won't Do tickets
**PASS** — Both tabs fetched in parallel on load: `?status=parking_lot` and `?status=wont_do`. `activeTab` state controls which dataset is displayed. API route filters by `t.status.toLowerCase() === 'parking lot'` and `"won't do"` respectively.

### AC9: Switching tabs updates cards immediately without page reload
**PASS** — Tab switching updates `activeTab` state; `currentData` derives from `activeTab === 'open' ? openData : deprioritizedData`. Data already loaded — instant switch, no fetch on tab change.

## Quality Scores
- Functionality: 5/5
- Robustness: 4/5
- Integration: 5/5

## Notes
- Team name mismatch between PRD names and Jira `teamName` field was caught and fixed during evaluation. Mapping added: Transform→"Transform Stream", Engage→"Engage Stream"+"PBS Stream", Identity & Payments→"IP Team", Academy→"Academy Stream"+"Acquire Stream", AI & Innovation→"AI & Innovation Stream", Content Ops→"Content Ops".
- "Content Ops" (91 Parking Lot groups) is the largest team in the data — replaced the PRD's "Other" catch-all with this real team name.
