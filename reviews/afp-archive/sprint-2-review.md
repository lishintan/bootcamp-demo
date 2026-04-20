# Sprint 2 Review
**Verdict**: PASS
**Attempt**: 1

---

## Acceptance Criteria

### AC1: When a ticket group matches a work item in one of the five team delivery projects (semantically, not by keyword), a bidirectional Jira link is created between the Product Feedback parent ticket and the matched work item.

**PASS** — `src/linking/matcher.ts:118–255` implements `linkGroupToDeliveryProjects()`, which iterates over all five `teamProjectKeys` from config, fetches delivery project tickets via `jira.getDeliveryProjectTickets(projectKey)`, then calls `findBestMatch()` (which uses `computeSimilarity()` — Claude API semantic judgment, not keyword matching). When a match is found, it calls `jira.createBidirectionalLink(group.parent.key, match.ticket.key, linkTypeName)` at line 177.

`createBidirectionalLink()` in `src/jira/client.ts:322–332` posts a single `/issueLink` record with `inwardIssue` (the Product Feedback parent) and `outwardIssue` (the delivery work item). Jira's `POST /issueLink` is inherently bidirectional — one record is visible on both tickets. This is the correct pattern; no second API call is needed or warranted.

---

### AC2: The matched team work item's status and priority remain unchanged after the link is created.

**PASS** — A full scan of `src/jira/client.ts` reveals no `PUT /issue` or `PATCH /issue` calls issued against delivery tickets. The only `PUT` call in the file is inside `addLabel()` (line 219), which operates on an issue key passed by the caller — and `addLabel()` is never invoked from any Sprint 2 code path (it is not called from `matcher.ts`, `scorer.ts`, or `link.ts`). `createBidirectionalLink()` only calls `POST /issueLink`. Delivery work item fields are never written.

---

### AC3: A ticket group with no matching delivery work item shows "Not linked to any delivery work item" in its output.

**PASS** — In `src/linking/matcher.ts:203–206`:
```typescript
const noMatchMessage =
  matches.length === 0
    ? 'Not linked to any delivery work item'
    : null;
```
This exact string is populated on the returned `GroupLinkResult.noMatchMessage` field. In `src/pipeline/link.ts:206`, the orchestrator additionally logs:
```typescript
console.log(`  — ${linkResult.noMatchMessage ?? 'Not linked to any delivery work item'}`);
```
The string is present in the structured output object, not merely in comments.

---

### AC4: When a group's volume of signals suggests the linked work item should be prioritised higher, a recommendation appears in the system output with a direct clickable link to that work item — but no Jira field is modified.

**PASS** — `src/linking/matcher.ts:229–239` constructs the URL as:
```typescript
const workItemUrl = `${baseUrl}/browse/${bestMatch.workItem.key}`;
```
where `baseUrl` is `config.jira.baseUrl` from the env var `JIRA_BASE_URL`. This produces a correct, clickable Jira URL.

The `PriorityBumpRecommendation` object at lines 229–239 is pure data; no API call is issued. Confirming: `jira.createBidirectionalLink()` is the only Jira write in the match flow, and no priority update follows the recommendation construction. The recommendation message also embeds the URL at line 238 (`View: ${workItemUrl}`), making it directly clickable/copyable from the console log.

The recommendation is gated on `impactScore > priorityBumpThreshold` AND `isBelowThreshold` check (lines 214–226), both read-only conditions.

---

### AC5: Groups for each team are ranked in descending order by Impact Score.

**PASS** — `src/linking/scorer.ts:161`:
```typescript
const sorted = [...groups].sort((a, b) => b.impactScore - a.impactScore);
```
`b - a` is descending order (higher scores first). The `[...groups]` spread ensures the original array is not mutated before slicing.

---

### AC6: The top-5 ranked feature groups per team are available as structured output for the digest sprints.

**PASS** — `rankGroupsForDigest()` in `src/linking/scorer.ts:132–170` produces a `TeamDigestEntry[]` where each entry has `topGroups: ScoredGroup[]` sliced to `topNPerTeam` (default 5, configurable via `IMPACT_SCORE_TOP_N`). The orchestrator at `src/pipeline/link.ts:244–264` serialises the full `LinkPipelineResult` (which includes `teamDigest: TeamDigestEntry[]`) to `logs/link-digest.json` using `JSON.stringify`. The `TeamDigestEntry` and `ScoredGroup` types are also re-exported from `src/index.ts:38–39` for programmatic consumption by future sprints.

---

### AC7: Running the cross-project linker twice on the same data does not create duplicate Jira links.

**PASS** — `src/linking/matcher.ts:168–191` calls `jira.linkExists(group.parent.key, match.ticket.key)` before calling `createBidirectionalLink()`. If `alreadyLinked` is `true`, the create call is skipped.

`linkExists()` in `src/jira/client.ts:338–346` fetches the issuelinks of `issueKeyA` and checks both directions:
```typescript
return links.some((link) => {
  return (
    link.inwardIssue?.key === issueKeyB ||
    link.outwardIssue?.key === issueKeyB
  );
});
```
Checking both `inwardIssue` and `outwardIssue` covers the case where a prior run created the link with the roles reversed (i.e., A was the outward issue). This is correct and complete idempotency coverage.

---

## TypeScript Integrity Check

**PASS** — Type flow is clean across Sprint 1 → Sprint 2:

- `TicketGroup` (`src/grouping/engine.ts:7–11`) has `parent: JiraTicket` and `children: JiraTicket[]`, matching the accesses in `findBestMatch()` (`group.parent`, `group.children.slice(0,3)`) and `computeImpactScore()` (`group.children.length`, `group.parent.customFields`).
- `GroupLinkResult` is correctly typed with `matches: MatchedWorkItem[]` and `noMatchMessage: string | null`, and `ScoredGroup.linkResult: GroupLinkResult` is initially stubbed with a placeholder in `computeImpactScore()` then overwritten via `scored.linkResult = linkResult` in the orchestrator (line 193 of `link.ts`).
- `JiraTicket.customFields: Record<string, unknown>` aligns with `readNumericField(customFields: Record<string, unknown>, ...)` in `scorer.ts:48`.
- No missing properties or type mismatches detected.

---

## Quality Scores

- **Functionality**: 5/5 — All seven acceptance criteria are correctly implemented end-to-end.
- **Robustness**: 4/5 — Error handling is solid (try/catch on every Jira call in the linking loop; graceful skip on missing custom fields). One minor gap: `getDeliveryProjectTickets()` passes an empty `customFieldIds` array by default (line 233 of `client.ts`), meaning the delivery ticket custom fields are not fetched. This is acceptable for Sprint 2 since only the delivery ticket's `priority` field is needed for the bump recommendation, and `priority` is a standard field always included. However, if future sprints need custom fields from delivery tickets, the caller will need to pass them explicitly.
- **Integration**: 5/5 — Sprint 2 correctly imports and uses Sprint 1 types (`TicketGroup`, `GroupingResult`) and re-exports all new types from `src/index.ts` for downstream sprint consumption. The `pnpm link` script in `package.json` wires up the pipeline entry point correctly.

---

## Feedback for Generator

None required — sprint passes all acceptance criteria.
