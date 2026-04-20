# Sprint 1 Contract — Jira Integration & Semantic Ticket Grouping

Completed: 2026-04-14 (bug fix applied: attempt 2)

---

## What Was Built

### Modules and Files

| File | Purpose |
|------|---------|
| `src/config/index.ts` | Reads and validates all environment variables. Throws at startup if required vars are missing. |
| `src/jira/client.ts` | `JiraClient` — authenticated Jira API v3 integration. Fetches Parking Lot tickets with pagination, retrieves issue links, creates parent-child links, and parses Atlassian Document Format (ADF) bodies to plain text. |
| `src/similarity/index.ts` | Semantic similarity via Claude (`claude-3-5-haiku-20241022`). `computeSimilarity()` calls the Anthropic Chat API with a structured prompt that returns a 0–1 float. `computeGroupSimilarity()` compares a candidate against up to 4 group representatives (early exit when threshold met). |
| `src/grouping/security.ts` | `isSecurityOrComplianceTicket()` — checks ticket labels and body text against 22 security/compliance keyword patterns (regex). Returns `true` if matched → ticket is skipped for grouping. |
| `src/grouping/deduplication.ts` | `computeDeduplicatedSignals()` — counts unique reporter account IDs per group, implementing the "unique user + unique issue = 1 signal" rule. |
| `src/grouping/engine.ts` | `GroupingEngine` — main grouping algorithm. Processes tickets sorted by creation date ascending; skips security tickets; compares each candidate against all existing groups; creates a Jira link if similarity ≥ threshold; starts a new group otherwise. Idempotent: checks existing links before creating new ones. `groupsUpdated` now tracks distinct groups that gained children (via a `Set<string>` of parent keys) rather than counting raw child-ticket additions (bug fix, attempt 2). |
| `src/state/index.ts` | Persists run timestamps to `.run-state.json` (JSON). `getSinceDate()` returns `undefined` on first run (process all), or the previous run's timestamp on subsequent runs. |
| `src/logger/index.ts` | Appends a JSONL entry to `logs/run-log.jsonl` after each run. Records: timestamp, run number, tickets processed, groups created, groups updated, links created, security-skipped count, standalone count, since-date, duration ms. |
| `src/pipeline/group.ts` | Pipeline entry point. Orchestrates the full flow: load state → fetch tickets → detect link type → run grouping engine → save state → write log. |
| `src/index.ts` | Public barrel export for programmatic use. |
| `package.json` | pnpm project. Dependencies: `@anthropic-ai/sdk`, `axios`, `dotenv`. Dev: `typescript`, `ts-node`, `@types/node`. |
| `tsconfig.json` | TypeScript `strict` mode, `ES2020` target, CommonJS modules, output to `dist/`. |
| `.env.example` | Documents all required and optional environment variables. |

### Integrations

- **Jira REST API v3** — authenticated with Basic Auth (email + API token). Reads via JQL (`project = X AND status = "Parking Lot"`), reads existing issue links, creates new issue links.
- **Anthropic Claude API** — `claude-3-5-haiku-20241022` model for semantic similarity scoring. Each comparison is one API call returning a structured JSON similarity float.

---

## Decisions on Ambiguous Criteria

1. **Semantic similarity implementation** — Used Anthropic Claude API (`@anthropic-ai/sdk`) rather than `@xenova/transformers`. Rationale: Claude provides higher-quality domain-specific similarity judgements without requiring a local model download (which would be impractical on first run and add ~500MB overhead). The API key is read from `ANTHROPIC_API_KEY`.

2. **Jira link type** — At runtime, the pipeline fetches available link types from the Jira instance and prefers one containing "cloner", "parent", or "blocks" in its name. Falls back to "Cloners" as default, then to the first available type. This handles variation across Jira Cloud instances.

3. **Parent-child Jira link direction** — Uses `inwardIssue = parent, outwardIssue = child`. The Jira "Cloners" link type reads as "[parent] is cloned by [child]", which is a reasonable proxy for parent-child grouping when a dedicated "Parent-Child" type isn't available.

4. **Group representatives for similarity** — When comparing a candidate against a group, only the first 4 members (parent + up to 3 children) are sampled to keep API call count bounded. If any representative scores ≥ threshold, the ticket is matched (early exit).

5. **"Clearly unrelated" definition (AC #3)** — A ticket that scores below the threshold (default 80%) against all existing groups is NOT force-grouped. It is promoted as the parent of a new group (it may attract future tickets). Singleton groups (parent with no children after the run) are reported as "standalone" in the log.

6. **Incremental processing date** — AC #7 says "only tickets created after the previous run's timestamp." The JQL filter uses `created >= "YYYY-MM-DD"`. This means tickets created ON the run date in prior runs will be re-evaluated on a same-day run. Acceptable trade-off: same-day duplicate links are skipped by the idempotency check.

7. **Security keyword list** — 22 patterns covering common security/compliance terminology (GDPR, CCPA, SOC 2, ISO 27001, HIPAA, CVE, XSS, CSRF, etc.). This list can be extended in `src/grouping/security.ts` without changing the pipeline logic.

---

## Known Limitations

1. **No Jira write for parent ticket metadata** — Per the PRD, the parent ticket does not inherit child metadata. The system only creates links. The parent remains unchanged.

2. **API rate limits** — For large ticket sets, repeated calls to the Anthropic API for pairwise similarity could be slow and costly. Each pairwise comparison is one API call. A corpus of N tickets, each compared against M groups with K representatives, generates up to N × M × K calls (with early exit). Consider batching for production scale.

3. **Link type availability** — If the Jira instance has no link types configured, the pipeline logs a warning and uses "Cloners" as default, which may fail if that type doesn't exist. In that case, the run completes but links are not created.

4. **No Jira webhook / real-time trigger** — Sprint 1 is batch-only. Scheduling (weekly Monday 8 AM) is wired up in Sprint 4/5. For now, the pipeline must be triggered manually.

5. **ADF parsing** — Jira descriptions use Atlassian Document Format. The parser extracts plain text from `text` nodes recursively. Rich content (tables, code blocks, macros) may lose formatting but the text content is preserved.

---

## How to Run

### Prerequisites

```bash
cp .env.example .env
# Fill in: JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY, ANTHROPIC_API_KEY
```

### Install and Build

```bash
pnpm install
pnpm build
```

### Run the Grouping Pipeline

```bash
# Production (compiled JS):
pnpm start

# Development (ts-node, no build needed):
pnpm group
```

### First Run
Processes **all** historical Parking Lot tickets. Run state is saved to `.run-state.json`.

### Subsequent Runs
Processes only tickets created **after** the previous run timestamp. Already-grouped tickets are not re-evaluated.

### Outputs

- **Jira** — parent-child issue links created between matched tickets
- **`.run-state.json`** — persisted timestamp and run count
- **`logs/run-log.jsonl`** — JSONL log file; one entry per run with full statistics
- **Console** — live progress output during the run
