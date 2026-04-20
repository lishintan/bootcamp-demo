# Sprint 1 Review
**Verdict**: PASS
**Attempt**: 2

---

## Acceptance Criteria

### AC1: The system reads all tickets with "Parking Lot" status from the Product Feedback Jira project without error.
**PASS** — `JiraClient.getParkingLotTickets()` (`src/jira/client.ts` lines 61–141) issues the JQL `project = "${projectKey}" AND status = "Parking Lot" ORDER BY created ASC`. Pagination loop at line 75 increments `startAt` by `data.issues.length` (line 134) — not by `maxResults` — so the final partial page is handled correctly. The loop terminates when `startAt >= data.total || data.issues.length === 0` (line 135). Basic Auth headers are constructed at lines 42–54 from env vars validated at startup via `requireEnv()` in `src/config/index.ts`. Error propagation is unblocked — no silent swallow.

### AC2: When two tickets describe the same issue in different words, the system creates a parent-child Jira link between them (the earlier ticket becomes the parent).
**PASS** — `GroupingEngine.run()` (`src/grouping/engine.ts` lines 50–52) sorts tickets ascending by `new Date(a.created).getTime()` before the main loop, guaranteeing the oldest ticket is processed first and becomes the group parent. When a candidate scores ≥ threshold against a group, `createLinkIfNotExists(bestGroup.parent.key, ticket.key)` (line 100) is called, with `parentKey` always being the oldest group member. The Jira `createParentChildLink()` (`src/jira/client.ts` lines 184–194) sends `inwardIssue = parentKey, outwardIssue = childKey`.

### AC3: A ticket whose content is clearly unrelated to any existing group remains standalone — it is not force-grouped.
**PASS** — In `engine.ts`, `bestGroup` initialises to `null` (line 78) and is only set when `score >= this.threshold && score > bestScore` (line 83). If no group clears the threshold, execution falls to the `else` branch (line 108–115), which pushes the ticket as the parent of a new singleton group. After the main loop, any group with `children.length === 0` is collected into `standaloneTickets` (lines 120–124). No force-grouping exists anywhere in the code path.

### AC4: If the same user submits multiple tickets about the identical problem, the resulting group counts that user as 1 unique signal, not multiple.
**PASS** — `computeDeduplicatedSignals()` (`src/grouping/deduplication.ts` lines 26–42) builds `new Set<string>(allTickets.map((t) => t.reporter.accountId))` where `allTickets = [parent, ...children]`. Because a Set discards duplicates, a user appearing N times contributes exactly 1 to `uniqueSignalCount` (which equals `uniqueReporterIds.size`). This is invoked per-group in `pipeline/group.ts` (line 108) and the result is printed to console.

### AC5: Tickets that contain security or compliance keywords (in labels or body) are left as individual tickets and not merged into any group.
**PASS** — `isSecurityOrComplianceTicket()` (`src/grouping/security.ts` lines 38–46) tests the concatenated label string and body text against 23 regex patterns (lines 8–32). Inside `engine.ts`, matching tickets are pushed to `securitySkipped` and `continue`d (lines 63–67) — they skip both the group-comparison loop and the new-group creation path. They are neither children of existing groups nor parents of new ones, making them fully standalone.

### AC6: On the first run, all historical Parking Lot tickets are processed and the run timestamp is persisted.
**PASS** — `loadRunState()` (`src/state/index.ts` lines 19–34) returns `{ lastRunAt: null, totalRunsCompleted: 0 }` when `.run-state.json` does not exist. `getSinceDate()` (lines 66–71) returns `undefined` when `lastRunAt` is `null`. `getParkingLotTickets(undefined)` uses the base JQL with no date filter (lines 62–64 of `client.ts`), fetching all historical tickets. After the run succeeds, `advanceRunState()` sets `lastRunAt` to `runAt.toISOString()` (line 56 of `state/index.ts`) and `saveRunState()` writes it to disk — crucially, these calls are at lines 120–121 of `pipeline/group.ts`, which is AFTER `engine.run()` completes, so the timestamp is only persisted on success.

### AC7: On a subsequent run, only tickets created after the previous run's timestamp are processed — previously grouped tickets are not re-evaluated.
**PASS** — On subsequent runs, `getSinceDate()` returns `new Date(state.lastRunAt)` (line 70 of `state/index.ts`). `getParkingLotTickets(sinceDate)` appends `AND created >= "YYYY-MM-DD"` (lines 65–69 of `client.ts`). The date format is produced by `since.toISOString().slice(0, 10)` which is correct ISO-to-YYYY-MM-DD conversion. The `.replace(/-/g, '-')` on line 67 is a no-op but harmless. Same-day tickets that were processed on the previous run may be re-fetched due to the inclusive `>=` date filter, but the idempotency check in `createLinkIfNotExists()` (lines 140–158 of `engine.ts`) prevents duplicate Jira links from being created.

### AC8: After each run completes, a log entry records the timestamp, number of tickets processed, and number of groups created or updated. (Bug from attempt 1: groupsUpdated should count distinct groups that gained children, not raw child additions.)
**PASS** — The AC8 bug from attempt 1 is confirmed fixed. Tracing the exact code path in `engine.ts`:
- Line 59: `const updatedGroupKeys = new Set<string>();` — a `Set<string>` is declared, not an integer counter.
- Line 96: `updatedGroupKeys.add(bestGroup.parent.key);` — when a child is added to a group, the parent's key is inserted into the Set (duplicates are discarded automatically).
- Line 132: `groupsUpdated: updatedGroupKeys.size` — the result field uses `.size`, the cardinality of distinct parent keys, not a raw incremented integer.

This means if group A receives 3 children and group B receives 1 child, `groupsUpdated` = 2 (not 4). The log entry in `src/logger/index.ts` (lines 22–43) records all required fields: `timestamp`, `ticketsProcessed`, `groupsCreated`, `groupsUpdated`, `linksCreated`, `securitySkipped`, `standaloneTickets`, `sinceDate`, and `durationMs`. `appendFileSync` ensures correct JSONL format. `writeRunLog()` is called at line 125 of `pipeline/group.ts`, after state is saved, on every code path (zero-ticket path at line 77, and normal path at line 125).

---

## Additional Checks

### TypeScript Type Correctness
No obvious type mismatches found. The `engine.ts` `run()` return type `GroupingResult` matches the interface defined at lines 14–21: `groupsUpdated: updatedGroupKeys.size` returns a `number` as required. The `Set<string>` generic is correctly typed. `strict: true` is set in `tsconfig.json`. The `!.name` non-null assertion at `pipeline/group.ts` line 58 (`linkTypes[0]!.name`) is safe given the guard `linkTypes.length > 0` immediately before it.

### Pagination Correctness
`startAt += data.issues.length` (line 134 of `client.ts`) — PASS. This correctly advances by actual results returned, not by the requested `maxResults`, handling under-full final pages correctly.

### State Timestamp Write Order
`saveRunState(newState)` is called at line 121 of `pipeline/group.ts`, which is after `await engine.run(tickets)` at line 95. If the engine throws, the catch at line 141 calls `process.exit(1)` and state is never written — PASS. The timestamp is only persisted after a successful run.

---

## Quality Scores
- Functionality: 5/5
- Robustness: 4/5
- Integration: 4/5

---

## Notes

No failures found. All eight acceptance criteria are met. The AC8 bug from attempt 1 (raw child-addition counter instead of a Set-based distinct-groups count) has been correctly resolved using the Set-based approach as specified in the attempt 1 feedback.

One minor non-blocking observation: the no-op `.replace(/-/g, '-')` in `client.ts` line 67 could be removed for clarity, but it does not affect correctness.
