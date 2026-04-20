# Sprint 5 Review
**Verdict**: PASS
**Attempt**: 1 (with orchestrator fix applied during evaluation)

## Acceptance Criteria

### AC1: A bookmark icon is visible on each insight card and within the insight detail view
**PASS** — `BookmarkButton` is rendered in `InsightCard` (line 540) with conditional opacity: fully visible when bookmarked (`opacity-100`), hover-reveal when not (`opacity-0 group-hover/card:opacity-100`). A second `BookmarkButton` is rendered in `DetailPanel`'s header action row (line 346). Both wire up to `onToggleBookmark`. Icons use filled SVG (bookmarked) vs outlined SVG (not bookmarked) with consistent indigo-400 accent.

### AC2: Clicking the bookmark icon when a user identity is selected saves the bookmark; the icon changes state to indicate the insight is bookmarked
**PASS** — `handleToggleBookmark` (line 1100) checks `currentUser`, posts to `/api/bookmarks`, and on success calls `setBookmarkedIds(prev => new Set(prev).add(group.id))`. The `bookmarkedIds` Set is passed into every `InsightCard` and `DetailPanel`, so the icon renders filled immediately. The POST handler (route.ts line 62) writes to `bookmarks.json` and returns 201. State is correctly managed.

### AC3: Attempting to bookmark an insight without a user identity selected prompts the user to first choose their name from the dropdown
**PASS** — `handleToggleBookmark` (line 1104) returns early with `setBookmarkError('Please select your name from the dropdown before bookmarking.')` if `currentUser` is falsy. An amber-styled toast banner is rendered in the view (line 1264) with a dismiss button. The `currentUser` state is seeded from `localStorage.getItem('pid_selected_user')` on mount and updated reactively via a `StorageEvent` listener (line 1073).

### AC4: A "Bookmarked Insights" section appears below the insight card grid on both the Open Insights and Deprioritized tabs
**PASS** — `BookmarkedInsightsSection` (line 1369) is placed inside the same render block that contains the Bugs and Feedback `CategorySection` components. Both tabs (open / deprioritized) load their data in parallel on entry; `currentData` is truthy for both, so the section renders on both tabs. The component is its own standalone section with its own fetch cycle and is independent of `activeTab`.

### AC5: When a team filter is active, the Bookmarks section shows only bookmarks associated with that team; when no team filter is active, a team dropdown filter appears within the Bookmarks section
**PASS** (Fix applied) — The original condition `selectedTeams.length !== 1` caused the dropdown to appear incorrectly when multiple teams were selected. Fix applied: changed to `selectedTeams.length === 0` (line 787) so the dropdown only appears when no team filter is active. Also fixed `activeTeam` to return `'All Teams'` when multiple teams are selected (instead of falling back to the dropdown value). When a single team is selected, `activeTeam = selectedTeams[0]` correctly scopes bookmarks to that team.

### AC6: Each bookmark entry displays the insight title, the date it was bookmarked, and the name of who bookmarked it
**PASS** — Each bookmark list item (line 859) renders: `bm.insightHook` as the title (line 865), `bm.bookmarkedBy` inline (line 889), and `new Date(bm.bookmarkedAt).toLocaleDateString(...)` formatted as "MMM D, YYYY" (line 891). All three fields are stored by the POST handler and returned by GET.

### AC7: Clicking "Remove" on a bookmark moves it to Archived state — it disappears from the default Open view but is not deleted
**PASS** — `handleArchive` (line 752) PATCHes `status: 'archived'` for open bookmarks (or `status: 'open'` for archived ones). The PATCH handler (route.ts line 24) updates the matching record in `bookmarks.json` by index and writes it back — the record is never deleted. After PATCH, `fetchBookmarks()` is called which re-fetches with `status=open` and the archived item no longer appears. The record persists in the JSON file.

### AC8: An "Archived" toggle within the Bookmarks section reveals all previously removed bookmarks
**PASS** — An Open/Archived toggle (line 801) is rendered in the `BookmarkedInsightsSection` header. Clicking "Archived" sets `showArchived = true`, which causes `fetchBookmarks` to set `status=archived` in the query params (line 734), returning only archived records. The `handleArchive` button label switches to "Restore" for archived items (line 908) and PATCH sends `status: 'open'`.

### AC9: Two users who select the same team see the same list of bookmarks for that team (shared storage)
**PASS** — Bookmarks are persisted server-side in `dashboard/data/bookmarks.json` (confirmed to exist and be valid JSON: `[]`). The GET handler reads from this shared file on every request. Both the POST and PATCH handlers write back to the same file. No per-user or per-session isolation exists in the storage layer, so all users reading the same team filter see the same data.

### AC10: The Bookmarked Insights section is absent from the "Who Are Our Customers" page
**PASS** — `app/customers/page.tsx` is a standalone server component that renders customer research charts only. It contains no import or reference to `BookmarkedInsightsSection`. The insights layout (including `InsightsClient`) is confined to `app/insights/`.

---

## Quality Scores
- Functionality: 4/5
- Robustness: 3/5
- Integration: 4/5

---

## Notes
- Team filter dropdown condition fixed (orchestrator): `selectedTeams.length !== 1` → `selectedTeams.length === 0`. Dropdown now correctly appears only when no team filter is active.
- `activeTeam` fixed: multi-team selection now returns `'All Teams'` rather than incorrectly falling back to the dropdown value.
- Known limitation: concurrent writes to `bookmarks.json` could cause race conditions under load. Acceptable for internal v1 usage.
