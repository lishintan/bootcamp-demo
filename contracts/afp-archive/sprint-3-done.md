# Sprint 3 Contract — Won't Do Candidate Pipeline & Slack Approval Flow

## What was built

### New source files

| File | Purpose |
|------|---------|
| `src/wont-do/state.ts` | JSON file-based state manager for pending approval messages, reminder counts, and per-ticket resolution status. Persists to `state/wont-do-state.json`. |
| `src/wont-do/router.ts` | Identifies Won't Do candidates by applying three rules: (1) insufficient description, (2) sprint-locked delivery item, (3) low impact score. Routes each candidate to the correct Product Ops member or Squad Lead. |
| `src/wont-do/slack.ts` | Builds and sends Slack Block Kit messages with per-ticket Approve/Skip buttons and a global Approve All button. Uses `@slack/web-api`. |
| `src/wont-do/reminders.ts` | Checks for pending messages due a reminder (no interaction within `WONT_DO_REMINDER_INTERVAL_HOURS` hours), sends reminders up to `WONT_DO_MAX_REMINDERS` times, then stops. |
| `src/wont-do/server.ts` | Express HTTP server (port `PORT`, default 3000) that handles Slack interactive button webhooks. Transitions Jira tickets to "Won't Do" on approve, leaves them in Parking Lot on skip. |
| `src/pipeline/wont-do.ts` | Top-level pipeline orchestrator. Runs grouping → impact scoring → delivery linking → candidate identification → Slack message delivery → state persistence. |

### Modified files

| File | Change |
|------|--------|
| `src/config/index.ts` | Added `slack` block (bot token, channel, Product Ops user IDs, Squad Lead user IDs) and `wontDo` block (low-impact threshold, state path, reminder interval, max reminders). Also added `serverPort`. |
| `src/jira/client.ts` | Added `getIssueRawFields()`, `getTransitions()`, `transitionIssue()`, `findTransitionId()` for Won't Do Jira transitions and sprint-lock checking. |
| `package.json` | Added `@slack/web-api ^7.3.4` and `express ^4.18.3` as runtime deps; `@types/express ^4.17.21` as dev dep. Added `wont-do` and `server` npm scripts. |
| `.env.example` | Documented all Sprint 3 environment variables. |

## Acceptance Criteria

| # | Criterion | Implementation |
|---|-----------|----------------|
| 1 | Insufficient-description ticket routed to correct Product Ops member | `router.ts` → `isInsufficientDescription()` (< 20 chars or useless filler) → `getProductOpsSlackUserId()` maps Academy/Engage → Darshini, Identity & Payments → Bryan, AI & Innovation/Transform → Jin Choy |
| 2 | Sprint-locked delivery ticket routed to Squad Lead with linked ticket ID | `router.ts` → `isSprintLocked()` checks status category + `customfield_10020` sprint field; routes to `getSquadLeadSlackUserId()` |
| 3 | Low-impact ticket routed to Squad Lead with score and justification | `router.ts` → compares `impactScore < WONT_DO_LOW_IMPACT_THRESHOLD`; reason includes score, linked count, segment weight, AI severity |
| 4 | Slack message arrives in `#shin-test-space` with Approve per ticket + Approve All | `slack.ts` → `sendWontDoApprovalMessage()` builds Block Kit blocks with per-ticket approve/skip buttons and one Approve All action |
| 5 | Clicking Approve on one ticket moves exactly that ticket; others unaffected | `server.ts` → `approve` action calls `moveToWontDo()` for that key only, then `resolveTicketInMessage()` with `ticketKey` |
| 6 | Clicking Approve All moves every listed ticket | `server.ts` → `approve_all` action iterates all unresolved tickets, calls `moveToWontDo()` for each, then `resolveAllTicketsInMessage()` |
| 7 | Clicking Skip leaves ticket in Parking Lot, no Jira update | `server.ts` → `skip` action calls only `resolveTicketInMessage(..., 'skipped')`, no Jira transition |
| 8 | No interaction within 24 hours → identical reminder message | `reminders.ts` → `getMessagesForReminder()` checks elapsed time ≥ `reminderIntervalHours`; sends new Slack message via `sendReminderMessage()` |
| 9 | After 3 unanswered reminders, no further messages | `reminders.ts` → skips messages where `reminderCount >= maxReminders` |
| 10 | System never autonomously moves ticket to Won't Do | All Jira transitions in `server.ts` are triggered only by explicit `approve` or `approve_all` button clicks |

## Routing tables

### Product Ops
| Team(s) | Person | Env var |
|---------|--------|---------|
| Academy, Engage | Darshini Mohanadass | `SLACK_USER_DARSHINI` |
| Identity & Payments | Bryan Swee | `SLACK_USER_BRYAN` |
| AI & Innovation, Transform | Jin Choy Chew | `SLACK_USER_JIN_CHOY` |

### Squad Leads
| Team | Person | Env var |
|------|--------|---------|
| Transform | Sambruce Joseph | `SLACK_USER_SAMBRUCE` |
| Engage | Palak Varma | `SLACK_USER_PALAK` |
| Identity & Payments | Natasha Tomkinson | `SLACK_USER_NATASHA` |
| Academy | Amanda Shin | `SLACK_USER_AMANDA` |
| AI & Innovation | Suresh Sakadivan | `SLACK_USER_SURESH` |

## How to run

```bash
# Step 1 — Run the full pipeline (identify candidates + send Slack messages)
pnpm wont-do

# Step 2 — Start the interaction server (required to handle button clicks)
pnpm server

# Step 3 — Re-run the pipeline periodically to send reminders
pnpm wont-do
```

## State file

Pending approval state is persisted at `state/wont-do-state.json`. Each `PendingMessage` record tracks:
- Message ID, Slack timestamp, channel, recipient
- Sent time, reminder count, last-reminder time
- Per-ticket: key, summary, reason, routing type, impact score, resolved flag, resolution

## Won't Do detection rules (priority order)

1. **Insufficient description** — description is `null`, blank, < 20 characters, or a known filler string (`n/a`, `no description`, `tbd`, etc.)
2. **Sprint-locked** — a linked delivery work item is In Progress, or has an active/future sprint in its `sprint` custom field (`customfield_10020`)
3. **Low impact** — computed impact score < `WONT_DO_LOW_IMPACT_THRESHOLD` (default 2.0)
