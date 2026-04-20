# Sprint 4 Contract — Weekly Bug Digest

## What was built

### New source files

| File | Purpose |
|------|---------|
| `src/digest/bug.ts` | Bug detection (`isBugTicket`), team assignment (`deriveTeamFromTicket`), audience routing (`getRecipientForTeam`), theme grouping (`groupBugTicketsByTheme`), digest construction (`buildBugDigests`), Slack Block Kit formatter (`buildBugDigestBlocks`), and Slack sender (`sendBugDigestMessage`). |
| `src/pipeline/weekly-digest.ts` | Top-level orchestrator (`runWeeklyBugDigest`). Fetches enriched Parking Lot tickets, filters for bugs, runs grouping + impact scoring + delivery linking, identifies Won't Do candidates, builds per-Product-Ops-member digests, persists Won't Do state, and sends Slack messages. Exports `runWeeklyBugDigest` for use by the server. |

### Modified files

| File | Change |
|------|--------|
| `src/config/index.ts` | Added `jira.teamFieldId` (JIRA_FIELD_TEAM, default `customfield_10060`) and `weeklyDigest` block (cron expression, timezone, audience routing map). |
| `src/wont-do/server.ts` | Registered `POST /trigger/weekly-digest` HTTP endpoint for manual triggering. Registered `node-cron` job with expression from config (`0 8 * * 1`, Monday 8:00 AM) sharing the same Express process. Imports `runWeeklyBugDigest` from `src/pipeline/weekly-digest.ts`. |
| `.env.example` | Added Sprint 4 environment variables (`JIRA_FIELD_TEAM`, `WEEKLY_DIGEST_CRON`, `WEEKLY_DIGEST_TIMEZONE`, `JIRA_FIELD_CUSTOMER_SEGMENT_WEIGHT`, `JIRA_FIELD_AI_SEVERITY`, `JIRA_TEAM_PROJECT_KEYS`). |
| `package.json` | Added `node-cron ^3.0.3` as runtime dep; `@types/node-cron ^3.0.11` as dev dep. Added `weekly-digest` and `start:weekly-digest` npm scripts. |

## Acceptance Criteria

| # | Criterion | Implementation |
|---|-----------|----------------|
| 1 | Slack message delivered to `#shin-test-space` every Monday 8:00 AM (within 5-minute window) | `server.ts` registers `cron.schedule('0 8 * * 1', ...)` with timezone config. Cron fires within the minute, well within the 5-minute window. |
| 2 | Each Product Ops member's message covers only their teams | `bug.ts` → `getRecipientForTeam()` maps teams to recipients using substring match; tickets for unrecognised teams are skipped (`null` return → logged and dropped). `buildBugDigests()` partitions by recipient before building sections. |
| 3 | Digest groups bug-category tickets by theme and shows unique user count per group | `bug.ts` → `groupBugTicketsByTheme()` clusters tickets by first-5-words prefix. `uniqueUserCount` is deduped by `reporter.accountId`. Both are surfaced in the Block Kit section text. |
| 4 | Each theme includes Impact Score and clickable link to parent Jira ticket | `buildBugDigestBlocks()` renders `*Impact Score:* ${scoreDisplay}` and `<${parentTicketUrl}|${parentTicketKey}>` per theme group. |
| 5 | Won't Do candidate list with Approve and Approve All buttons, same flow as Sprint 3 | `buildBugDigestBlocks()` renders per-candidate Approve buttons (`bug_digest_approve_${key}`) and an Approve All button (when >1 candidate). Payloads use the shared `messageId` registered in `wont-do-state.json` so the existing Sprint 3 webhook handler (`server.ts`) processes them identically. |
| 6 | Insufficient-description tickets appear in a dedicated section for Product Ops approval | `buildBugDigests()` splits `insufficientDescriptionTickets` (null/blank/< 20 chars) from actionable tickets. `buildBugDigestBlocks()` renders them under *Tickets Requiring Description (Product Ops Approval Needed)*. |
| 7 | No Confluence page created or updated | `runWeeklyBugDigest` makes no calls to any Confluence API. The entire flow is Jira read + Slack write only. |
| 8 | Empty team sections omitted; if no bugs at all, send "No bug tickets this week" | `buildBugDigests()` filters `teamTickets.length === 0` (AC8 team-level), sets `hasNoBugTickets=true` when `teamSections.length === 0`. `buildBugDigestBlocks()` returns an early "No bug tickets this week" block when `hasNoBugTickets` is true. |

## Bug detection rules

A ticket is treated as a bug if **either** condition is true (OR logic):

1. `ticket.issueType.toLowerCase().includes('bug')` — Jira issue type name contains "Bug"
2. `ticket.labels.some((label) => label.toLowerCase() === 'bug')` — Labels contain "bug"

Helper: `isBugTicket(ticket: JiraTicket): boolean` in `src/digest/bug.ts`.

## Team assignment

The team is derived from custom field `JIRA_FIELD_TEAM` (default `customfield_10060`) on each Product Feedback ticket. The field is parsed as:

- Plain string → team name
- Object with `value` property → team name
- Object with `name` property → team name
- null / undefined / unrecognised → ticket is **skipped** (not assigned to any team)

Helper: `deriveTeamFromTicket(ticket: JiraTicket): string | null` in `src/digest/bug.ts`.

## Audience routing

| Recipient | Teams covered | Slack user env var |
|-----------|--------------|-------------------|
| Darshini Mohanadass | Academy, Engage | `SLACK_USER_DARSHINI` |
| Bryan Swee | Identity & Payments | `SLACK_USER_BRYAN` |
| Jin Choy Chew | AI & Innovation, Transform | `SLACK_USER_JIN_CHOY` |

Routing uses substring match against `config.weeklyDigest.audienceRouting` keywords (case-insensitive).

## Schedule trigger

Registered in `src/wont-do/server.ts` (same Express process as the Slack interaction webhook):

```
Cron expression: 0 8 * * 1   (Monday, 8:00 AM)
Timezone:        Asia/Kuala_Lumpur  (override via WEEKLY_DIGEST_TIMEZONE)
```

Manual trigger: `POST /trigger/weekly-digest` (responds 202, runs async).

## Won't Do integration

1. After building the digest, `runWeeklyBugDigest` calls `identifyWontDoCandidates()` (Sprint 3 router) on bug-group scored tickets.
2. A shared `messageId` (UUID) is assigned to all candidates in the digest run.
3. The pending message is written to `state/wont-do-state.json` so the existing Sprint 3 button handler can process Approve/Skip clicks.
4. `buildBugDigestBlocks()` inlines Approve + Approve All buttons with `DigestButtonPayload` values referencing the same `messageId`, wiring button clicks through the existing `/slack/interactions` webhook.

## How to run

```bash
# One-shot manual run (useful for testing)
pnpm weekly-digest

# Long-running server: Slack interactions + cron job (recommended for production)
pnpm server

# Manual HTTP trigger (while server is running)
curl -X POST http://localhost:3000/trigger/weekly-digest
```

## TypeScript

Compiles cleanly with `tsc --noEmit --strict`. No type errors.

## Bug Fix (post-delivery)

**Bug:** The `DigestButtonPayload` interface in `src/digest/bug.ts` declared button action literals as `'wont_do_approve'` and `'wont_do_approve_all'`. The Sprint 3 Slack interaction handler in `src/wont-do/server.ts` expects `'approve'` and `'approve_all'`. Every button click from the bug digest silently fell through to the `else` branch (`Unknown button action`) — buttons rendered in Slack but did nothing.

**Fix applied to `src/digest/bug.ts`:**
- `DigestButtonPayload.action` type: `'wont_do_approve' | 'wont_do_approve_all'` → `'approve' | 'approve_all'`
- Per-ticket Approve button payload: `action: 'wont_do_approve'` → `action: 'approve'` (line ~513)
- Approve All button payload: `action: 'wont_do_approve_all'` → `action: 'approve_all'` (line ~537)
