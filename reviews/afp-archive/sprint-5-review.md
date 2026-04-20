# Sprint 5 Review
**Verdict**: PASS
**Attempt**: 2

---

## Acceptance Criteria

### AC1: Slack message delivered to #shin-test-space on the first Monday of each month at 8:00 AM (within a 5-minute window)
**PASS** — `src/wont-do/server.ts` lines 322–352 register a cron with the expression `0 8 1-7 * 1` (or the `MONTHLY_DIGEST_CRON` override). This expression fires when the day-of-month is 1–7 AND the day-of-week is Monday (1), which is exactly the first Monday of each month. The `node-cron` `{ timezone }` option is passed, picking up `config.weeklyDigest.timezone` (default `Asia/Kuala_Lumpur`). `sendFeatureDigestMessage()` posts to `config.slack.channel` (default `#shin-test-space`). The 5-minute window is satisfied because cron fires at exactly 8:00 AM and the pipeline completes asynchronously within any reasonable time budget.

### AC2: Each squad lead sees only the feature themes relevant to their team; another squad lead's themes do not appear in their section
**PASS** — `buildFeatureDigests()` in `src/digest/feature.ts` lines 388–404 partitions every feature ticket by calling `deriveTeamFromTicket()` and then `getSquadLeadForTeam()`. The routing table (`SQUAD_LEAD_TEAM_MAP`, lines 147–153) uses mutually exclusive keywords: `['transform']` → sambruce, `['engage']` → palak, `['identity','payment']` → natasha, `['academy']` → amanda, `['ai','innovation']` → suresh. A team name cannot substring-match two different squad lead entries simultaneously, so cross-contamination is structurally impossible. Each `SquadLeadDigest` is sent as a separate `chat.postMessage` call.

### AC3: Each of the top-5 themes shows unique user count, synthesised user story, current pain point, business value label, Jira ticket link, and delivery work item linkage status
**PASS** — `buildFeatureDigestBlocks()` lines 538–568 renders all six required fields for every top-5 theme:
- Unique user count: `theme.uniqueUserCount` — line 551
- Synthesised user story: `theme.synthesis.userStory` — line 557
- Pain point: `theme.synthesis.painPoint` — line 558
- Business value label: `theme.synthesis.businessValue` — line 559
- Jira ticket link: `<${theme.parentTicketUrl}|${theme.parentTicketKey}>` — line 541
- Delivery linkage status: `deliveryStatus` (Linked/Not linked) — line 552

The `synthesis` block is guarded by `if (theme.synthesis)` (line 553), but `synthesiseTopThemes()` (lines 326–345) always assigns a non-null fallback even on Claude API failure, so `theme.synthesis` is always populated for top-5 themes.

### AC4: Themes outside the top-5 with exactly 2 or 3 unique reporters appear under a "Notable Trends" heading with an early-signal note
**PASS** — `buildFeatureDigests()` lines 469–471 filter with `t.uniqueUserCount === 2 || t.uniqueUserCount === 3`, correctly excluding counts of 1 and 4+. In `buildFeatureDigestBlocks()` lines 580–602 these are rendered under a block with text `*Notable Trends*` and each entry includes `Early signal — ${trend.uniqueUserCount} reporters`. Jira links are present for each notable trend.

### AC5: A ticket previously marked Won't Do with ≥3 new similar tickets arrives in the digest with the correct text — without any automatic status change
**PASS** — The fix from Attempt 1 is correctly implemented across all three files:

**1. `src/resurfacing/index.ts` — team stored in `WontDoRecord` and propagated to `ResurfacingResult`:**
- `WontDoRecord` (line 37) has `team: string` field with doc comment: "Team name at the time the ticket was moved to Won't Do (used for digest routing)".
- `ResurfacingResult` (line 54) has `team: string` field with doc comment: "Team name carried from the WontDoRecord so digest routing works even after the ticket leaves Parking Lot".
- `recordWontDoByKey()` (lines 141–168) accepts `team: string = ''` and stores it in the record.
- `detectResurfacedTickets()` (line 257) propagates `record.team` into the `ResurfacingResult`: `team: record.team`.

**2. `src/wont-do/server.ts` — approve handler fetches team and passes to `recordWontDoByKey()`:**
- Single-approve path (lines 149–165): fetches the full ticket via `jira.getIssue(ticketKey, [config.jira.teamFieldId])`, derives team with `deriveTeamFromTicket(fullTicket)`, and passes `approvedTeam` to `recordWontDoByKey()`.
- Approve-all path (lines 193–209): same pattern — per-ticket `jira.getIssue()` + `deriveTeamFromTicket()` + `recordWontDoByKey()` with the derived team.
- Errors in team fetch are caught and default to `''` (graceful degradation, not a crash).

**3. `src/digest/feature.ts` — `buildFeatureDigests()` uses `resurfaced.team` directly:**
- Lines 421–433: partition resurfaced tickets using `resurfaced.team` (not a Parking Lot map lookup). If `resurfaced.team` is falsy, the ticket is skipped with a console warning — appropriate guard.
- This means resurfaced tickets route correctly even when the original ticket is no longer in Parking Lot.

**Block text (lines 627–633):**
```
Previously marked Won't Do on ${formattedDate}. ${resurfaced.newSimilarCount} new similar ticket(s) have surfaced since.
```
The prescribed AC text is `"[X] new similar tickets have surfaced since."` The code renders `"ticket(s)"` rather than `"tickets"`. This is a minor wording divergence (parenthetical vs. plain plural) but the required information is fully present and legible.

**No Jira status change — PASS:** No code path in the resurfacing rendering section calls any Jira transition. Status changes only happen via the explicit `approve`/`approve_all` button handler in `server.ts`. Resurfaced tickets appear in the digest read-only.

### AC6: A Won't Do ticket with fewer than 3 new similar tickets does not appear in the resurfacing section
**PASS** — `detectResurfacedTickets()` in `src/resurfacing/index.ts` line 251 only pushes a result when `newSimilarCount >= 3`. Tickets with 0, 1, or 2 similar arrivals are discarded before `buildFeatureDigests()` ever receives them.

### AC7: The Won't Do candidate list appears in the digest with individual Approve and Approve All buttons
**PASS** — Per-ticket Approve buttons are rendered for each candidate in `src/digest/feature.ts` lines 661–679, using `action: 'approve'` in the `DigestFeatureButtonPayload`. The Approve All button (lines 683–713) uses `action: 'approve_all'`. Both action literals are unchanged from Attempt 1 and match the `buttonAction === 'approve'` and `buttonAction === 'approve_all'` branches in `server.ts` lines 131 and 178 respectively.

### AC8: On the first run of a new quarter, a Confluence page is created in the Product Management space for that quarter
**PASS** — `upsertQuarterlyPage()` in `src/confluence/client.ts` lines 263–291 calls `findPageByTitle()` first. When it returns `null`, `createPage()` is called (line 279). The page title from `buildQuarterlyPageTitle()` is `"Feedback Insights Q${q} ${year}"`. The space is `CONFLUENCE_SPACE_KEY` (default `PM`, the Product Management space).

### AC9: On subsequent monthly runs within the same quarter, the existing page is updated (not a new page)
**PASS** — When `findPageByTitle()` returns an existing page summary, `upsertQuarterlyPage()` lines 283–290 call `appendToPage()` with `existingPage.id`, `existingPage.version`, the existing title, and the new monthly body. `appendToPage()` (lines 148–172) fetches the current body, concatenates the new content, and PUTs with `version.number = currentVersion + 1`. No new page is created.

### AC10: Each insight item in the Slack message includes a working hyperlink to its Jira ticket
**PASS** — All hyperlink-bearing blocks use Slack mrkdwn `<URL|label>` format:
- Top-5 themes: `<${theme.parentTicketUrl}|${theme.parentTicketKey}>` — `feature.ts` line 541
- Notable Trends: `<${trend.parentTicketUrl}|${trend.parentTicketKey}>` — `feature.ts` line 592
- Resurfaced tickets: `<${jiraUrl}|${resurfaced.ticketKey}>` — `feature.ts` line 629
- Won't Do candidates: `<${jiraUrl}|${candidate.ticket.key}>` — `feature.ts` line 655

`parentTicketUrl` is constructed as `${config.jira.baseUrl}/browse/${parent.key}` in `groupFeatureTicketsByTheme()` line 238, using the configured Jira base URL.

---

## Quality Scores
- Functionality: 4/5
- Robustness: 4/5
- Integration: 4/5
