# Sprint 6 Contract — Adoption Tracker & End-to-End Scheduling Hardening

Completed: 2026-04-14

---

## What Was Built

### New Files

| File | Purpose |
|------|---------|
| `src/adoption/tracker.ts` | `runAdoptionCheck()` — counts Product Feedback parent tickets whose linked delivery ticket has statusCategory "Done". Fetches all Idea-type tickets with issue links, skips clone/cloner links (internal grouping), returns `adoptedCount`, `totalParents`, and `adoptedKeys`. Uses `withRetry` for Jira calls. |
| `src/utils/retry.ts` | `withRetry<T>(fn, maxAttempts, delayMs, label?)` — retries an async function up to `maxAttempts` times, waiting `delayMs` ms between attempts. Logs failures with ISO timestamp on each attempt and re-throws on final failure. |

### Modified Files

| File | Change |
|------|--------|
| `src/jira/client.ts` | Added `JiraIssue` interface. Added `getLinkedDeliveryTickets(parentKey)` — returns delivery-related linked issues (filters out clone/cloner links), with key, status name, statusCategoryName, statusCategoryKey. Added `getIssueStatus(key)` — returns the statusCategory name. Added `fetchProductFeedbackParentTickets()` — JQL `project = "PF" AND issuetype in (Idea) AND issueLinks is not EMPTY` with pagination. |
| `src/confluence/client.ts` | `upsertQuarterlyPage()` signature extended with optional `adoptionCount?: number`. When creating a new quarterly page (first run of the quarter), an adoption summary section is appended to the page body: count of adopted parent tickets with generation timestamp. Subsequent monthly appends are unaffected. |
| `src/wont-do/server.ts` | Added in-memory job lock (`jobRunning` map, `acquireLock()`, `releaseLock()`) for `weekly`, `monthly`, and `quarterly` job types. All three cron handlers now acquire the lock before running and release it in a `finally` block; if the previous run is still in progress, the new fire is skipped with a warning log. Both trigger endpoints (`/trigger/weekly-digest`, `/trigger/monthly-digest`) now return HTTP 429 `{"error":"Job already running"}` if the job is locked; otherwise return HTTP 202 `{"status":"triggered"}`. Added `POST /trigger/adoption-check` endpoint (same lock pattern). Added quarterly adoption cron (`0 8 1-7 1,4,7,10 1`, first Monday of Jan/Apr/Jul/Oct at 8 AM). |
| `src/pipeline/weekly-digest.ts` | Wrapped `fetchParkingLotTicketsEnriched()` call with `withRetry(..., 2, 5000, ...)`. On final failure, logs the error with ISO timestamp before re-throwing. |
| `src/pipeline/monthly-digest.ts` | Wrapped `fetchParkingLotTicketsEnriched()` call with `withRetry(..., 2, 5000, ...)`. On final failure, logs with ISO timestamp before re-throwing. When writing the quarterly Confluence page, checks if the page already exists: if not (new quarter), runs `runAdoptionCheck()` first and passes the count to `upsertQuarterlyPage()`. |
| `src/config/index.ts` | Added `quarterlyAdoption.cronExpression` (reads `QUARTERLY_ADOPTION_CRON`, default `"0 8 1-7 1,4,7,10 1"`). |
| `.env.example` | Added Sprint 6 section documenting `QUARTERLY_ADOPTION_CRON`. |

---

## Acceptance Criteria Coverage

| AC | Status | Implementation |
|----|--------|----------------|
| 1. Once per quarter, count Product Feedback parent tickets whose linked delivery ticket is Done/Completed | Done | Quarterly cron `0 8 1-7 1,4,7,10 1` in `server.ts` fires `runAdoptionCheck()`. Checks both statusCategoryKey=`"done"` and raw status names (Done/Completed/Closed/Resolved). |
| 2. Adoption count written to quarterly Confluence page on creation | Done | Monthly pipeline calls `runAdoptionCheck()` when creating a new quarter's page (page not found by title). Passes `adoptionCount` to `upsertQuarterlyPage()`, which appends an `<h2>` adoption section with the count. |
| 3. Parent ticket with no linked delivery ticket is NOT counted | Done | `getLinkedDeliveryTickets()` filters out clone/cloner links. If the resulting list is empty, the parent is skipped in `runAdoptionCheck()`. |
| 4. POST /trigger/weekly-digest produces a correctly-formatted Slack message | Done | Endpoint calls `runWeeklyBugDigest()` (Sprint 4 pipeline) asynchronously; returns `{"status":"triggered"}`. Pipeline unchanged. |
| 5. POST /trigger/monthly-digest produces a correctly-formatted Slack message and Confluence update | Done | Endpoint calls `runMonthlyFeatureDigest()` (Sprint 5 pipeline) asynchronously; returns `{"status":"triggered"}`. Pipeline unchanged. |
| 6. If Jira API is temporarily unavailable, retry at least once before failing, log failure reason | Done | `withRetry(..., 2, 5000)` wraps all top-level Jira fetches in both digest pipelines and in `runAdoptionCheck()`. Each failure logs `[RETRY] <ISO-timestamp> — <label> failed (attempt N/max)`. Final failure logs `[RETRY] <timestamp> — ... failed after N attempts. Final error: ...`. |
| 7. Running any scheduled job twice in the same window does not produce duplicate outputs | Done | In-memory lock per job type. HTTP triggers return HTTP 429 `{"error":"Job already running"}` if locked. Cron handlers skip the new fire with a warning log if the previous run is still in progress. |

---

## Retry Utility

```typescript
withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delayMs: number,
  label = 'operation'
): Promise<T>
```

- 2 attempts, 5 000 ms delay for all Jira fetch calls in pipelines and adoption tracker.
- Logs each failure with ISO timestamp (`[RETRY] <ts> — <label> failed (attempt N/max). Retrying in Nms. Error: ...`).
- On final failure: `[RETRY] <ts> — <label> failed after N attempt(s). Final error: ...` — then re-throws.

---

## Idempotency Guard

In-memory lock per job type (`weekly`, `monthly`, `quarterly`) in `src/wont-do/server.ts`:

| Scenario | Behaviour |
|----------|-----------|
| HTTP trigger while job is running | Returns HTTP 429 `{"error":"Job already running"}` immediately |
| Cron fires while previous run is still running | Logs warning, skips the new fire |
| Lock is always released | Released in `finally` block — never left held if the pipeline throws |

---

## Adoption Tracker Details

### JQL used
```
project = "PF" AND issuetype in (Idea) AND issueLinks is not EMPTY ORDER BY created ASC
```

### Link type filtering
`getLinkedDeliveryTickets()` inspects `issuelinks` on a parent ticket and excludes any link whose type name (lowercased) contains `"clone"` or `"cloner"`. These are the internal parent-child grouping links created by the Sprint 1 engine. All other link types (Relates, Blocks, etc.) are treated as delivery links.

### Done detection
A delivery ticket is counted as Done if **either** is true:
- `statusCategoryKey === "done"` (canonical Jira signal)
- Raw `status.name` (lowercased) is one of: `"done"`, `"completed"`, `"closed"`, `"resolved"`

### Parent counted as adopted if
At least one linked delivery ticket is Done. Multiple Done tickets on the same parent still count as 1 adopted parent.

---

## Confluence Adoption Section (page body on creation)

```xml
<h2>Q[N] [YYYY] Adoption Summary</h2>
<p>Product Feedback tickets adopted (linked delivery ticket marked Done): <strong>[N]</strong></p>
<p><em>Adoption count generated on [ISO timestamp]</em></p>
<hr/>
```

This section is appended **only when creating a new quarterly page** (first run of the quarter). Subsequent monthly appends do not include it.

---

## New Endpoints

| Method | Path | Behaviour |
|--------|------|-----------|
| `POST` | `/trigger/weekly-digest` | Returns 202 `{"status":"triggered"}` or 429 `{"error":"Job already running"}` |
| `POST` | `/trigger/monthly-digest` | Returns 202 `{"status":"triggered"}` or 429 `{"error":"Job already running"}` |
| `POST` | `/trigger/adoption-check` | Returns 202 `{"status":"triggered"}` or 429 `{"error":"Job already running"}` |

---

## New Cron Jobs

| Job | Expression | Fires |
|-----|-----------|-------|
| Quarterly adoption check | `0 8 1-7 1,4,7,10 1` | First Monday of Jan, Apr, Jul, Oct at 8:00 AM |

Existing crons unchanged:
- Weekly bug digest: `0 8 * * 1` (every Monday 8:00 AM)
- Monthly feature digest: `0 8 1-7 * 1` (first Monday of each month 8:00 AM)

---

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `QUARTERLY_ADOPTION_CRON` | `0 8 1-7 1,4,7,10 1` | Cron expression for quarterly adoption check |

---

## TypeScript

Compiles cleanly with `tsc --noEmit --strict`. Exit code 0. No type errors.
