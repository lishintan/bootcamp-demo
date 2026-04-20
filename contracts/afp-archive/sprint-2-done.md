# Sprint 2 Contract — Cross-Project Linker & Impact Ranking

Completed: 2026-04-14

---

## What Was Built

### New Files

| File | Purpose |
|------|---------|
| `src/linking/matcher.ts` | Semantic cross-project matcher. `findBestMatch()` compares a ticket group (parent + up to 3 children) against all open delivery work items using Claude similarity. `linkGroupToDeliveryProjects()` orchestrates matching across all five team projects, creates bidirectional Jira links (idempotent), and surfaces priority-bump recommendations. |
| `src/linking/scorer.ts` | Impact Score computation and ranking. `computeImpactScore()` reads `linkedTicketCount × customerSegmentWeight × aiSeverity` from the group and its parent's Jira custom fields. `rankGroupsForDigest()` sorts per-team groups descending by Impact Score and returns the top-N for each team. |
| `src/pipeline/link.ts` | Sprint 2 top-level orchestrator. Runs grouping, enriches parents with custom fields, computes Impact Scores, performs cross-project linking, and writes a structured `logs/link-digest.json` output. |

### Modified Files

| File | Change |
|------|--------|
| `src/config/index.ts` | Added `jira.teamProjectKeys` (map of team name → project key, configurable via env vars), `impactScore.*` config block (field IDs, threshold, bump priorities, top-N). |
| `src/jira/client.ts` | Extended with `getDeliveryProjectTickets()`, `createBidirectionalLink()`, `linkExists()`, and `getIssue()`. All Sprint 1 methods remain unchanged. |
| `src/index.ts` | Added barrel exports for all Sprint 2 types and functions. |
| `package.json` | Added `"link"` and `"start:link"` scripts. |

---

## Acceptance Criteria Coverage

| AC | Status | Implementation |
|----|--------|---------------|
| 1. Bidirectional Jira link created when group semantically matches delivery work item | Done | `linkGroupToDeliveryProjects()` calls `jira.createBidirectionalLink()`. A single Jira link record is inherently visible on both issues. |
| 2. Matched work item status and priority remain unchanged | Done | No `PUT /issue` calls are made for delivery work items. Only `POST /issueLink` is used. |
| 3. Unmatched group shows "Not linked to any delivery work item" | Done | `GroupLinkResult.noMatchMessage` is set to that exact string when `matches` is empty. |
| 4. Priority-bump recommendation surfaced with direct clickable link, no Jira write | Done | `PriorityBumpRecommendation.workItemUrl` = `${JIRA_BASE_URL}/browse/${key}`. No Jira field is modified. |
| 5. Groups ranked descending by Impact Score per team | Done | `rankGroupsForDigest()` sorts descending by `impactScore` within each team. |
| 6. Top-5 ranked groups per team available as structured output | Done | `TeamDigestEntry[]` written to `logs/link-digest.json` and returned from `rankGroupsForDigest()`. Configurable via `IMPACT_SCORE_TOP_N` (default 5). |
| 7. Running twice does not create duplicate Jira links | Done | `jira.linkExists()` checks existing links before calling `createBidirectionalLink()`. Idempotent. |

---

## Configuration

All new configuration is read from environment variables with sensible defaults:

| Env Var | Default | Purpose |
|---------|---------|---------|
| `JIRA_PROJECT_KEY_ENGAGE` | `ENG` | Engage team project key |
| `JIRA_PROJECT_KEY_TRANSFORM` | `TRF` | Transform team project key |
| `JIRA_PROJECT_KEY_AI_INNOVATION` | `AIINN` | AI & Innovation team project key |
| `JIRA_PROJECT_KEY_ACADEMY` | `ACA` | Academy team project key |
| `JIRA_PROJECT_KEY_IDENTITY_PAYMENTS` | `IAP` | Identity & Payments team project key |
| `JIRA_TEAM_PROJECT_KEYS` | (individual vars above) | Bulk override: `"Engage:ENG,Transform:TRF,..."`  |
| `JIRA_FIELD_CUSTOMER_SEGMENT_WEIGHT` | `customfield_10050` | Custom field ID for customer segment weight |
| `JIRA_FIELD_AI_SEVERITY` | `customfield_10051` | Custom field ID for AI severity rating |
| `IMPACT_SCORE_BUMP_THRESHOLD` | `10` | Impact Score above which bump recommendation fires |
| `IMPACT_SCORE_BUMP_BELOW_PRIORITY` | `Low,Lowest` | Work item priorities that trigger bump recommendation |
| `IMPACT_SCORE_TOP_N` | `5` | Number of top groups per team in digest |

---

## Impact Score Formula

```
Impact Score = max(linkedTicketCount, 1) × customerSegmentWeight × aiSeverity
```

- `linkedTicketCount`: number of child tickets in the Product Feedback group
- `customerSegmentWeight`: numeric Jira custom field on the parent ticket (defaults to 1.0 if missing/unset)
- `aiSeverity`: numeric Jira custom field on the parent ticket (defaults to 1.0 if missing/unset)
- `max(..., 1)` ensures singleton groups still produce a non-zero score

Custom field values are read tolerantly: raw numbers, numeric strings, and Jira option objects (`{ value: "2.5" }`) are all handled.

---

## Decisions on Ambiguous Criteria

1. **"Bidirectional" Jira link** — Jira's link model is inherently bidirectional: a single `POST /issueLink` record appears on both tickets' link panels. The system creates one link record per pair. This satisfies AC #1 without double-posting.

2. **Delivery project ticket scope** — `getDeliveryProjectTickets()` fetches all issues in the delivery project where `statusCategory != Done`. This avoids matching against already-completed work while still catching backlog and in-progress items.

3. **Group text for matching** — The group is represented as parent + up to 3 children, concatenated. This provides richer semantic context than the parent alone, while bounding API call cost.

4. **Priority-bump recommendation trigger** — The recommendation fires when: (a) Impact Score > threshold AND (b) the matched work item's priority is in `bumpBelowPriorities` list OR has no priority set. The recommendation is a structured object with a direct URL — no Jira field is modified.

5. **No match handling** — If a group finds no match in any of the five delivery projects, `noMatchMessage` = `"Not linked to any delivery work item"` and `matches` = `[]`. The group still appears in `scoredGroups` but is excluded from all team digests.

6. **Custom field defaults** — If `customerSegmentWeight` or `aiSeverity` fields are absent or unparseable, they default to `1.0` (a neutral multiplier that preserves `linkedTicketCount` as the sole ranking factor). This ensures the system is fully operational even without custom fields configured.

---

## How to Run

### Prerequisites

Add new env vars to `.env` (all optional — defaults apply if not set):

```bash
# Team project keys
JIRA_PROJECT_KEY_ENGAGE=ENG
JIRA_PROJECT_KEY_TRANSFORM=TRF
JIRA_PROJECT_KEY_AI_INNOVATION=AIINN
JIRA_PROJECT_KEY_ACADEMY=ACA
JIRA_PROJECT_KEY_IDENTITY_PAYMENTS=IAP

# Custom field IDs (check your Jira instance)
JIRA_FIELD_CUSTOMER_SEGMENT_WEIGHT=customfield_10050
JIRA_FIELD_AI_SEVERITY=customfield_10051

# Impact Score thresholds
IMPACT_SCORE_BUMP_THRESHOLD=10
IMPACT_SCORE_BUMP_BELOW_PRIORITY=Low,Lowest
IMPACT_SCORE_TOP_N=5
```

### Run the Linking Pipeline

```bash
# Development (ts-node, no build needed):
pnpm link

# Production (compiled JS):
pnpm build
pnpm start:link
```

### Outputs

- **Jira** — bidirectional "Relates to" links between Product Feedback parent tickets and matched delivery work items
- **`logs/link-digest.json`** — structured JSON: scored groups with Impact Scores, per-team top-5 ranked lists, and priority-bump recommendations
- **Console** — live progress: group matching results, link creation status, priority-bump alerts
