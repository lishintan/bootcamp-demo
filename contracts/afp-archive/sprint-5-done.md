# Sprint 5 Contract — Monthly Feature Digest, Confluence & Resurfacing Engine

Completed: 2026-04-14

---

## What Was Built

### New Source Files

| File | Purpose |
|------|---------|
| `src/digest/feature.ts` | Feature ticket detection (`isFeatureTicket()`), squad lead routing (`getSquadLeadForTeam()`), theme grouping (`groupFeatureTicketsByTheme()`), Claude synthesis (`synthesiseTheme()`, `synthesiseTopThemes()`), digest construction (`buildFeatureDigests()`), Slack Block Kit formatter (`buildFeatureDigestBlocks()`), and Slack sender (`sendFeatureDigestMessage()`). |
| `src/confluence/client.ts` | Confluence REST API v2 client. `findPageByTitle()`, `createPage()`, `appendToPage()`, `getPageBody()`. Quarterly page helpers: `getQuarter()`, `buildQuarterlyPageTitle()`, `buildMonthlyConfluenceBody()`, `upsertQuarterlyPage()`. |
| `src/resurfacing/index.ts` | Won't Do resurfacing state manager. Persists to `state/resurfacing-state.json`. `recordWontDoByKey()`, `recordWontDoTicket()`, `detectResurfacedTickets()` — counts new semantically-similar tickets since each ticket's wontDoDate and returns those with ≥3. |
| `src/pipeline/monthly-digest.ts` | Sprint 5 top-level orchestrator. Fetches enriched Parking Lot tickets → filters features → groups + scores + links → identifies Won't Do candidates → runs resurfacing check → builds per-squad-lead digests → sends Slack → writes/updates quarterly Confluence page. |

### Modified Files

| File | Change |
|------|--------|
| `src/wont-do/server.ts` | Added `POST /trigger/monthly-digest` HTTP endpoint. Added monthly digest cron job (`0 8 1-7 * 1`, first Monday of month, 8:00 AM). Imports `runMonthlyFeatureDigest`. On `approve` and `approve_all` button clicks, now records the approved ticket(s) in `state/resurfacing-state.json` via `recordWontDoByKey()`. |
| `src/config/index.ts` | Added `confluence` block reading `CONFLUENCE_BASE_URL`, `CONFLUENCE_USER_EMAIL`, `CONFLUENCE_API_TOKEN`, `CONFLUENCE_SPACE_KEY` from env vars. |
| `package.json` | Added `"monthly-digest"` and `"start:monthly-digest"` npm scripts. |
| `.env.example` | Documented all Sprint 5 environment variables. |

---

## Acceptance Criteria Coverage

| AC | Status | Implementation |
|----|--------|----------------|
| 1. Slack message delivered to `#shin-test-space` on first Monday of each month at 8:00 AM (within 5-minute window) | Done | `server.ts` registers `cron.schedule('0 8 1-7 * 1', ...)` — fires on Mondays (day 1) that fall on days 1–7 = first Monday of the month. Timezone from `WEEKLY_DIGEST_TIMEZONE`. |
| 2. Each squad lead sees only their team's themes | Done | `buildFeatureDigests()` partitions by `getSquadLeadForTeam(teamName)` (substring match). Each `SquadLeadDigest` is a separate Slack message to `#shin-test-space`. |
| 3. Top-5 themes show: unique user count, synthesised user story, pain point, business value, Jira link, delivery work item link status | Done | `synthesiseTopThemes()` calls Claude once per theme with a batched prompt. `buildFeatureDigestBlocks()` renders all fields from the `ThemeSynthesis` result. |
| 4. Themes outside top-5 with exactly 2–3 unique reporters appear under "Notable Trends" with "Early signal — N reporters" note | Done | `buildFeatureDigests()` filters `allThemes.slice(5)` for `uniqueUserCount === 2 \|\| uniqueUserCount === 3`. `buildFeatureDigestBlocks()` renders them under *Notable Trends* heading. |
| 5. Previously Won't Do'd ticket with ≥3 new similar tickets appears with correct text | Done | `detectResurfacedTickets()` in `resurfacing/index.ts` compares each record against new tickets via `computeSimilarity()`. Matching ones appear with "Previously marked Won't Do on [date]. [X] new similar ticket(s) have surfaced since." Bug fix applied: `team` is now stored in `WontDoRecord` at approve time so `buildFeatureDigests()` can route resurfaced tickets correctly even after they leave Parking Lot. |
| 6. Won't Do ticket with <3 new similar tickets does NOT appear in resurfacing section | Done | `detectResurfacedTickets()` only returns entries where `newSimilarCount >= 3`. |
| 7. Won't Do candidate list has individual Approve and Approve All buttons | Done | `buildFeatureDigestBlocks()` renders per-ticket Approve buttons (`feature_digest_approve_{key}`) and an Approve All button (when >1 candidate) with confirm dialog. Uses same `approve`/`approve_all` action payload format as Sprint 3, so existing webhook handler processes them. |
| 8. First run of a new quarter creates a new Confluence page in PM space | Done | `upsertQuarterlyPage()` calls `findPageByTitle()` — if no page found, calls `createPage()`. |
| 9. Subsequent monthly runs append to the existing quarterly page | Done | `upsertQuarterlyPage()` calls `appendToPage()` with `currentVersion + 1` when the page already exists. |
| 10. Each insight item includes a working hyperlink to its Jira ticket | Done | `buildFeatureDigestBlocks()` renders `<${theme.parentTicketUrl}|${theme.parentTicketKey}>` (Slack mrkdwn hyperlink) for every top-5 theme and Notable Trend. Resurfaced tickets also render `<jiraUrl|ticketKey>`. |

---

## Feature Detection Rule

```typescript
export function isFeatureTicket(ticket: JiraTicket): boolean {
  const issueTypeLower = ticket.issueType.toLowerCase();
  const isFeatureType =
    issueTypeLower.includes('feature') || issueTypeLower.includes('idea');
  return isFeatureType && !isBugTicket(ticket);
}
```

- Contains "feature" or "idea" in the Jira issue type name (case-insensitive)
- AND does NOT trigger `isBugTicket()` (no "Bug" in issuetype)

---

## Claude Synthesis (AC3)

Each top-5 theme gets one Claude API call (`claude-3-5-haiku-20241022`) with a prompt that returns:

```json
{
  "userStory": "As a [user], I want [goal] so that [benefit].",
  "painPoint": "One-sentence description of the current struggle.",
  "businessValue": "engagement | consumption | retention"
}
```

The prompt includes up to 5 representative ticket summaries/descriptions for context. Fallback values are used if the API call fails so the digest still renders.

---

## Won't Do Resurfacing (AC5/AC6)

State file: `state/resurfacing-state.json`

```json
{
  "wontDoTickets": [
    {
      "ticketKey": "PF-123",
      "summary": "...",
      "description": "...",
      "wontDoDate": "2026-01-15T00:00:00.000Z",
      "team": "Transform"
    }
  ]
}
```

**Write path:** When a user clicks Approve or Approve All in any digest message, `server.ts` fetches the ticket from Jira to resolve its team via `deriveTeamFromTicket()`, then calls `recordWontDoByKey()` to persist the ticket (including the team) in `resurfacing-state.json`.

**Team routing fix (AC5):** `WontDoRecord` now stores a `team` field set at approve time. `ResurfacingResult` carries this `team` field through `detectResurfacedTickets()`. `buildFeatureDigests()` reads `resurfacedTicket.team` directly instead of looking up the key in the current `featureTickets` array — fixing the bug where Won't Do'd tickets (no longer in Parking Lot) were silently skipped and never appeared in the resurfacing section.

**Read path:** On each monthly run, `detectResurfacedTickets()` fetches all current Parking Lot tickets, compares each Won't Do record against tickets created AFTER the `wontDoDate` using Claude semantic similarity, and returns those where `newSimilarCount >= 3`.

---

## Confluence Integration

- **API version:** REST API v2 (`/wiki/api/v2`)
- **Authentication:** Basic auth with `CONFLUENCE_USER_EMAIL:CONFLUENCE_API_TOKEN`
- **Space:** `CONFLUENCE_SPACE_KEY` (default `"PM"`)
- **Page title format:** `"Feedback Insights Q[Q] [YYYY]"` (e.g. `"Feedback Insights Q2 2026"`)
- **Page body format:** Confluence storage format (XHTML). Each monthly run appends an `<h2>` section with the digest summaries.
- **Graceful degradation:** If any of the three Confluence env vars are unset, the Confluence step is skipped and the Slack digest still runs.

---

## Schedule Trigger

```
Monthly cron: 0 8 1-7 * 1
```

`1-7 * 1` means: day-of-month is 1–7 AND day-of-week is Monday.
This is exactly the first Monday of each month.
Override via `MONTHLY_DIGEST_CRON` env var.

---

## Squad Lead Routing

| Squad Lead | Team(s) | Slack User Env Var |
|------------|---------|-------------------|
| Sambruce Joseph | Transform | `SLACK_USER_SAMBRUCE` |
| Palak Varma | Engage | `SLACK_USER_PALAK` |
| Natasha Tomkinson | Identity & Payments | `SLACK_USER_NATASHA` |
| Amanda Shin | Academy | `SLACK_USER_AMANDA` |
| Suresh Sakadivan | AI & Innovation | `SLACK_USER_SURESH` |

---

## Configuration

All new configuration read from environment variables:

| Env Var | Default | Purpose |
|---------|---------|---------|
| `CONFLUENCE_BASE_URL` | (empty) | Confluence base URL, e.g. `https://your-org.atlassian.net/wiki` |
| `CONFLUENCE_USER_EMAIL` | (empty) | Atlassian user email |
| `CONFLUENCE_API_TOKEN` | (empty) | Atlassian API token |
| `CONFLUENCE_SPACE_KEY` | `PM` | Confluence space key for quarterly pages |
| `MONTHLY_DIGEST_CRON` | `0 8 1-7 * 1` | Cron expression for monthly run |
| `RESURFACING_STATE_PATH` | `./state/resurfacing-state.json` | Path to resurfacing state file |

---

## How to Run

```bash
# One-shot monthly feature digest:
pnpm monthly-digest

# Long-running server (all crons + interactions):
pnpm server

# Manual HTTP trigger (while server is running):
curl -X POST http://localhost:3000/trigger/monthly-digest
```

## TypeScript

Compiles cleanly with `tsc --noEmit --strict`. No type errors.
