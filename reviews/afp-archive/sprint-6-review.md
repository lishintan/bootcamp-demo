# Sprint 6 Review
**Verdict**: PASS
**Attempt**: 1

## Acceptance Criteria

### AC1: Once per quarter, the system counts Product Feedback parent tickets whose linked delivery ticket status is "Done" or "Completed"
**PASS** — Quarterly cron `0 8 1-7 1,4,7,10 1` is registered in `src/wont-do/server.ts:453` and correctly fires `runAdoptionCheck()`. Done detection in `src/adoption/tracker.ts:45–54` checks `statusCategoryKey === 'done'` (canonical Jira signal) and falls back to raw status names `done`, `completed`, `closed`, `resolved` (case-insensitive). The cron expression itself is read from `config.quarterlyAdoption.cronExpression` (which reads `QUARTERLY_ADOPTION_CRON`, defaulting to the correct value), satisfying the "once per quarter" requirement.

### AC2: Adoption count written to quarterly Confluence page on creation
**PASS** — `upsertQuarterlyPage()` in `src/confluence/client.ts:266` accepts an optional `adoptionCount?: number` parameter. When `!existingPage` (new quarter, first run), it appends an `<h2>` adoption summary section including the count and a generation timestamp (`client.ts:284–297`). The call site in `src/pipeline/monthly-digest.ts:365–391` checks `findPageByTitle()` first; if the page does not exist it calls `runAdoptionCheck()` and passes `adoptionResult.adoptedCount` to `upsertQuarterlyPage()`. Subsequent monthly runs that find an existing page pass `adoptionCount` as `undefined`, so the adoption section is not re-appended.

### AC3: A parent ticket with no linked delivery ticket is not counted
**PASS** — `getLinkedDeliveryTickets()` in `src/jira/client.ts:436–439` skips any link where the type name (lowercased) contains `"clone"` or `"cloner"`. If all links on a parent are of that type, the returned array is empty. `runAdoptionCheck()` in `src/adoption/tracker.ts:108–111` explicitly checks `if (deliveryTickets.length === 0)` and skips the parent with a log entry, so it is never added to `adoptedKeys`. The JQL (`issueLinks is not EMPTY`) pre-filters tickets to those with at least one link, but the secondary filter in tracker.ts correctly handles the case where all links are clone/cloner grouping links.

### AC4: POST /trigger/weekly-digest produces a correctly-formatted Slack message in #shin-test-space within 5 minutes
**PASS** — `src/wont-do/server.ts:281–301` registers `POST /trigger/weekly-digest`. It acquires the weekly lock first; if already locked, returns `429 {"error":"Job already running"}`. Otherwise returns `202 {"status":"triggered","message":"..."}` and fires `runWeeklyBugDigest()` asynchronously. The pipeline (Sprint 4, unchanged) formats and sends the bug digest to the configured Slack channel (`config.slack.channel`, default `#shin-test-space`). The lock is released in `.finally()` (`server.ts:300`), so a subsequent call after completion will succeed.

### AC5: POST /trigger/monthly-digest produces a correctly-formatted Slack message and a Confluence page update within 5 minutes
**PASS** — `src/wont-do/server.ts:308–328` registers `POST /trigger/monthly-digest` with the same lock/202/429 pattern. `runMonthlyFeatureDigest()` in `src/pipeline/monthly-digest.ts` sends Slack messages (Step 9, lines 319–337) and then writes/updates the quarterly Confluence page (Step 10, lines 340–398). The Confluence write is gated only on env vars being present (`CONFLUENCE_BASE_URL`, `CONFLUENCE_USER_EMAIL`, `CONFLUENCE_API_TOKEN`); it is not skipped by default when those are configured.

### AC6: If the Jira API is temporarily unavailable, the scheduled job retries at least once before failing and logs the failure reason
**PASS** — `src/utils/retry.ts` implements `withRetry<T>()` with a loop from `attempt = 1` to `maxAttempts`. On each non-final failure it logs `[RETRY] <ISO-ts> — <label> failed (attempt N/max). Retrying in Nms. Error: ...`. On final failure it logs `[RETRY] <ISO-ts> — <label> failed after N attempt(s). Final error: ...` before re-throwing (`retry.ts:28–43`). Both `weekly-digest.ts:145` and `monthly-digest.ts:180` call `withRetry(..., 2, 5000, ...)` around `fetchParkingLotTicketsEnriched()`, guaranteeing at least 1 retry (2 total attempts). `runAdoptionCheck()` similarly wraps `fetchProductFeedbackParentTickets()` (`tracker.ts:76–85`) and `getLinkedDeliveryTickets()` (`tracker.ts:93–104`) with `withRetry(..., 2, 5000, ...)`.

### AC7: Running any scheduled job twice in the same window does not produce duplicate Slack messages or duplicate Confluence edits
**PASS** — An in-memory `jobRunning: Record<JobType, boolean>` map is maintained for `'weekly'`, `'monthly'`, and `'quarterly'` in `src/wont-do/server.ts:48–52`. `acquireLock()` returns `false` if the flag is already `true` (server.ts:59–63). All three HTTP trigger handlers check the lock and return `429` immediately if held (server.ts:282–286, 309–313, 336–340). All three cron handlers check the lock and log a warning + return early if held (server.ts:382–385, 424–427, 466–469). All six lock acquisitions are paired with a `releaseLock()` in a `finally` block (server.ts:300, 327, 353, 394, 441, 483), ensuring the lock is always released even if the pipeline throws.

## Quality Scores
- Functionality: 5/5
- Robustness: 5/5
- Integration: 5/5

## Notes

No issues requiring a re-run were found. A few observations for future consideration (non-blocking):

1. **Redundant filter in link-type check**: `linkTypeName.includes('clone') || linkTypeName.includes('cloner')` — since `'cloner'` contains `'clone'`, the second condition is always subsumed by the first. Harmless, but could be simplified to just `linkTypeName.includes('clone')`.

2. **`require.main === module` in ESM-style files**: Both pipeline files use this CommonJS idiom while importing via ES module syntax (`.js` extensions). This is a pre-existing pattern from Sprints 4 and 5, not introduced by Sprint 6, and is not a regression.

3. **Confluence space key mismatch**: The AC says "Product Management space" and the `CONFLUENCE_SPACE_KEY` defaults to `"PM"`. The space key is configurable, which is the right approach.

All seven acceptance criteria are fully and correctly implemented.
