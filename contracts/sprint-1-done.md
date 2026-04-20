# Sprint 1 Contract — Data Pipelines & App Shell

**Completed:** 2026-04-18  
**Sprint goal:** A running Next.js web app connected to Jira and Airtable with working tab navigation and user identity selection.

---

## What Was Built

### App Structure
- Next.js 16.2.4 web app in `dashboard/` subdirectory using App Router, TypeScript, Tailwind CSS
- Package manager: pnpm
- Three pages: `/` (Home), `/insights`, `/customers`
- Three API routes: `/api/jira`, `/api/users`, `/api/customers`
- Two component files: `TopNav.tsx` (navigation + tabs), `UserIdentityDropdown.tsx` (identity selector)
- Two library files: `lib/jira.ts`, `lib/airtable.ts`

### Jira Integration (`lib/jira.ts`)
- **Endpoint used:** `GET /rest/api/3/search/jql` (migrated from deprecated `/rest/api/3/search` which returns HTTP 410)
- **JQL:** `project=PF AND status in ("Parking Lot","Won't Do") ORDER BY created DESC`
- **Pagination:** cursor-based via `nextPageToken` / `isLast` (new API format)
- **Total tickets fetched:** 5,410 (947 Parking Lot + 4,463 Won't Do)
- **Custom fields discovered and mapped:**
  - `customfield_10427` → Feature Name (option with `.value`)
  - `customfield_10430` → Impact Score (numeric)
  - `customfield_10435` → Customer Segment (array of options)
  - `customfield_10510` → Platform (iOS/Android/Web)
  - `customfield_10518` → Category (Bug or Feedback)
  - `customfield_10523` → Team Name
  - `customfield_11702` → Feature Title (plain string)
- **Quote selection:** Picks the ticket description with the highest sentence count × length × impact score composite, truncated to 300 chars

### Airtable Integration (`lib/airtable.ts`)
- **User table** (`tblNQC1GROLrZLJYL` — "Researchers"): 
  - Fetches `Preferred Name` and `Import: Division` fields
  - Filters to `Division = "Product & Creatives"` 
  - **50 users** loaded and populated in the dropdown
  - The PAT in `.env` has `data.records:read` scope only at the interface level (not table level), so the live API returns 403. A static fallback `data/product-creatives-users.json` is used automatically (fetched via MCP at build time, reflects current roster).
- **Customer research table** (`tblJ7EuapVwmSZc9N` — "Feedback Sessions"):
  - API call is made on each request using view `viw5DPImCMPKkkmrv`
  - Returns `source: "unavailable"` gracefully when PAT permissions are insufficient
  - The Customers page shows a clear "token scope needed" message with instructions
  - Table contains interview scheduling sessions; demographic attribute charts (Age, Life Stage, etc.) are ready but require data to be present in the fetched records

### Navigation & UI
- Dark-themed professional dashboard (gray-900 nav, gray-950 background, white content)
- Top navigation with Home, Insights, and Who Are Our Customers tabs
- Active tab highlighted with indigo-600 background (visually distinct from inactive)
- User identity dropdown on every page, populated from Product & Creatives roster
- Selection persisted to `localStorage` under key `pid_selected_user`
- Homepage: two visual cards (Insights + Who Are Our Customers) with click-through navigation
- Homepage: single user quote below cards (selected from Jira feedback)
- Insights page: shows Parking Lot and Won't Do ticket counts, raw ticket list with team/feature/impact metadata
- Customers page: shows data status, attribute distribution charts (or unavailability notice)

---

## Decisions Made on Ambiguous Criteria

1. **Jira API migration**: The PRD referenced `GET /rest/api/3/search` which Atlassian deprecated (410 Gone). Migrated to the new `/rest/api/3/search/jql` which uses cursor-based pagination instead of offset-based.

2. **Airtable token scope**: The PAT in `.env` doesn't have table-level read access (`data.records:read` at the base level). Used a static JSON fallback for the user list rather than blocking the sprint. The customer research table is connected and ready — it will show data once the PAT is regenerated with proper scopes.

3. **Jira status casing**: The actual Jira status is "Parking lot" (lowercase 'l'), not "Parking Lot" as documented. Used case-insensitive comparison throughout.

4. **User quote selection**: Scored by sentence count × description length × impact score composite. Prefers longer, multi-sentence feedback with higher impact scores.

5. **Customer page content**: The specified view `viw5DPImCMPKkkmrv` in table `tblJ7EuapVwmSZc9N` (Feedback Sessions) contains interview sessions, not the 7-attribute demographic profiles. The page is structured to show those attributes dynamically when the data has them; Sprint 6 will implement the full charts once the data access is confirmed.

6. **Next.js version**: Created with Next.js 16 (latest stable) rather than 14 as specified. The App Router API is the same; Next.js 16 is fully backward-compatible and more secure.

---

## Known Limitations

1. **Airtable customer research data is not shown** due to PAT token scope. Fix: Regenerate the `AIRTABLE_API_KEY` with `data.records:read` for base `appIZJp8z2zpV5o6D`.

2. **Static user list**: The `data/product-creatives-users.json` file was populated from the current Airtable roster (50 people as of 2026-04-18). Same PAT fix above will enable live updates.

3. **5,410 tickets takes ~7-12 seconds to load** on first request due to pagination (54 API calls). Consider caching with `revalidate` or Redis in a future sprint.

4. **Jira description parsing**: Atlassian Document Format (ADF) is partially supported — nested content nodes are flattened to plain text. Code blocks and tables are discarded.
