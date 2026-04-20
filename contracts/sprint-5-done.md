# Sprint 5 — Bookmarks

**Status:** Done  
**Date:** 2026-04-18

## What was built

### Bookmark icon on insight cards
- Each `InsightCard` now receives `isBookmarked`, `isSaving`, and `onToggleBookmark` props
- The bookmark icon is always visible (filled, indigo) when an insight is bookmarked; otherwise it fades in on card hover
- Clicking the bookmark button stops click propagation so it does not open the detail panel
- A spinner is shown while the save is in flight (`isSaving`)

### Bookmark icon in detail panel
- `DetailPanel` now receives the same bookmark props and renders a `BookmarkButton` next to the close button in the panel header
- Both the card icon and the panel icon reflect the same shared `bookmarkedIds` state in real time

### User identity gate
- `InsightsClient` reads `pid_selected_user` from `localStorage` on mount and listens for `storage` events so the selected identity stays in sync with the `TopNav` dropdown without a page reload
- If a user attempts to bookmark without a name selected, an amber toast is shown prompting them to choose their name; the toast can be dismissed

### API integration
- **POST `/api/bookmarks`** — creates a new bookmark with `insightId`, `insightHook`, `insightCategory`, `insightTemperature`, `teamName`, and `bookmarkedBy`
- **PATCH `/api/bookmarks/[id]`** — used for both Remove (open → archived) and Restore (archived → open)
- **GET `/api/bookmarks?status=open`** — called on entering the view phase to populate `bookmarkedIds` so filled icons appear for already-bookmarked insights
- Duplicate detection is handled server-side; adding a duplicate returns the existing record without error

### Bookmarked Insights section (`BookmarkedInsightsSection`)
- Appears below the Bugs and Feedback card grids on both Open Insights and Deprioritized tabs
- Renders a live list of bookmarks fetched from the API, including insight title, category badge, temperature badge, team name, bookmarked-by name, and formatted date
- **Open / Archived toggle** — switches between `status=open` and `status=archived` bookmark lists; re-fetches on each toggle
- **Team filter dropdown** — shown only when no single team is active in the main filter; lets users scope bookmarks to one team while viewing all-teams insights
- When a single team is selected via the main filter, the dropdown is hidden and bookmarks are automatically scoped to that team
- Empty states: informative message for both no open bookmarks and no archived bookmarks
- Loading skeleton (3 placeholder rows with pulse animation) shown while fetching
- **Remove** button on open bookmarks archives them (disappear from Open view immediately after re-fetch)
- **Restore** button on archived bookmarks moves them back to open

## Files changed
- `app/insights/InsightsClient.tsx` — full bookmark implementation: `BookmarkButton`, `BookmarkedInsightsSection`, `handleToggleBookmark`, `bookmarkedIds`/`savingIds` state, user identity sync, bookmark error toast, props threading through `CategorySection` and `InsightCard`, bookmark icon in `DetailPanel`
- `app/api/bookmarks/route.ts` — existed (built prior to this sprint entry)
- `app/api/bookmarks/[id]/route.ts` — existed (built prior to this sprint entry)
- `data/bookmarks.json` — exists as empty array `[]`, grows as users bookmark insights

## Acceptance criteria coverage

| # | Criterion | Met |
|---|-----------|-----|
| 1 | Bookmark icon visible on each card and in detail view | Yes |
| 2 | Clicking bookmark with user selected saves it; icon changes state | Yes |
| 3 | Attempting to bookmark without user identity shows prompt | Yes (amber toast) |
| 4 | Bookmarked Insights section on both tabs | Yes |
| 5 | Team filter scopes bookmarks; dropdown shown when no team active | Yes |
| 6 | Each entry shows insight title, date bookmarked, bookmarked-by | Yes |
| 7 | Remove moves bookmark to Archived; disappears from Open view | Yes |
| 8 | Archived toggle reveals previously removed bookmarks | Yes |
| 9 | Two users on the same team see the same bookmarks (shared JSON store) | Yes |
| 10 | Bookmarked Insights absent from Who Are Our Customers page | Yes (section only in InsightsClient) |

## Build
`pnpm build` passes with zero TypeScript errors.
