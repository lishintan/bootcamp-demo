# Sprint Plan — Insights Database Persistence

Generated: 2026-05-15
PRD: [insights-database-persistence.md](../prd/product-intelligence-dashboard/insights-database-persistence.md)

---

## Sprint 1 — Database Setup & Schema

**Goal:** Postgres database provisioned and schema in place. Nothing else changes yet — app still works as before.

**Scope:**
- Provision Postgres via `kessel db` (Cloud SQL attached to Cloud Run)
- Create `lib/db.ts` — connection pool using `DATABASE_URL` env var (pg/postgres.js)
- Write and run schema migration creating three tables:
  - `pipeline_runs` (id UUID, triggered_by, status, started_at, completed_at, ticket_count, group_count, error)
  - `jira_tickets` (key + run_id PK, summary, description, status, labels JSONB, created, updated, impact_score, team_name, feature_name, category, platform, archived)
  - `insight_groups` (id + run_id PK, title, ai_summary, hook, category, team_name, feature_name, frequency, impact_score, recency, temperature, temperature_score, why_tag, sources JSONB, ticket_keys JSONB)
- `DATABASE_URL` added to Kessel env vars

**Acceptance Criteria:**
- [ ] `kessel db` provisioned and reachable from Cloud Run
- [ ] All three tables exist with correct columns and primary keys
- [ ] `lib/db.ts` connects and runs a test query without error
- [ ] Existing dashboard behaviour unchanged

---

## Sprint 2 — Pipeline Write Path

**Goal:** After the clustering pipeline runs, results are written to Postgres. The app still reads from Redis/memory for now.

**Scope:**
- Create `lib/pipeline.ts` — orchestrates the full run: fetch Jira → cluster → enrich → write DB
- On start: insert a `pipeline_runs` row with `status = 'running'`
- Concurrency guard: if any run has `status = 'running'`, abort and return a conflict error
- On success: bulk-insert `jira_tickets` and `insight_groups` rows, update run to `status = 'completed'`
- On failure: update run to `status = 'failed'` with error message (email alert deferred — Sprint 5)
- Pruning: after a successful write, delete `jira_tickets` and `insight_groups` rows where `run_id` belongs to runs older than 7 days (keep `pipeline_runs` rows forever)

**Acceptance Criteria:**
- [ ] A pipeline run creates one row in `pipeline_runs`, N rows in `jira_tickets`, M rows in `insight_groups`
- [ ] `ticket_keys` on each `insight_group` row contains the correct ticket keys for that group
- [ ] A second concurrent trigger returns a conflict error and starts no new run
- [ ] A failed run is marked `failed` with a non-null `error` column
- [ ] After a successful run, ticket/group rows for runs older than 7 days are deleted

---

## Sprint 3 — API Read Path

**Goal:** `/api/insights` reads from Postgres instead of running the pipeline. Cold start goes from 5 minutes to under 3 seconds.

**Scope:**
- Update `GET /api/insights` to query `insight_groups` joined to `jira_tickets` (via `ticket_keys`) for the latest `completed` run
- Reconstruct the full `InsightGroup` shape (including the `tickets` array with all fields) from DB rows
- Retire the Redis cluster cache (`pid-clusters-*`) — remove read/write cache calls from `route.ts`
- Retain the in-memory `clusterCache` Map as a within-request dedup guard only (not cross-request)
- Fallback: if no `completed` run exists (fresh deploy), respond with `{ groups: [], total: 0, ... }` and a `bootstrapping: true` flag so the UI can show a "Pipeline hasn't run yet" message instead of an error

**Acceptance Criteria:**
- [ ] Cold Cloud Run start serves insight groups in under 3 seconds
- [ ] Report counts and Jira ticket links on each card match the DB snapshot
- [ ] No AI calls or Jira fetches happen during a normal dashboard load
- [ ] Fresh deploy with empty DB returns a clean empty state, not a 500

---

## Sprint 4 — Scheduled Run & Manual Trigger

**Goal:** Pipeline runs automatically at 9am GMT+8 daily, and any PM can manually trigger a refresh from the dashboard.

**Scope:**
- Create `POST /api/pipeline/trigger` — internal endpoint that kicks off `lib/pipeline.ts`; returns 409 if already running, 202 if accepted
- Wire up Cloud Scheduler cron via Kessel at `0 1 * * *` (1am UTC = 9am GMT+8) calling `/api/pipeline/trigger`
- Add `GET /api/pipeline/status` — returns `{ status, startedAt, triggeredBy }` for the latest run (used by the UI to poll)
- Add "Refresh Insights" button to the insights page header (visible to all users):
  - Calls `POST /api/pipeline/trigger`
  - Disabled + shows "Updating…" spinner while status is `running`
  - Polls `/api/pipeline/status` every 10 seconds while running
  - When run completes, shows "Updated just now" and refreshes the insight data

**Acceptance Criteria:**
- [ ] Cloud Scheduler fires at 1am UTC and a new completed run appears in `pipeline_runs`
- [ ] "Refresh Insights" button appears in the dashboard header for all users
- [ ] Button is disabled and shows "Updating…" while a run is in progress
- [ ] Clicking while a run is already running shows a "Refresh already in progress" message
- [ ] When a manual run completes, the dashboard automatically re-fetches and displays the new data

---

## Sprint 5 — Failure Alerting (deferred — pending SendGrid API key)

**Goal:** Failed pipeline runs send an email alert to `lishin.tan@mindvalley.com`.

**Blocked by:** `SENDGRID_API_KEY` must be added to Kessel env vars before this sprint can run.

**Scope:**
- Add SendGrid dependency (`@sendgrid/mail`)
- Create `lib/alert.ts` — sends a failure email with run ID, triggered_by, started_at, and error message
- Call `alert()` from `lib/pipeline.ts` whenever a run is marked `failed`
- Email from: `noreply@productintelligence.mindvalley.com` (or similar — confirm sender domain with SendGrid)

**Acceptance Criteria:**
- [ ] A deliberately-failed test run sends an email to `lishin.tan@mindvalley.com`
- [ ] Email contains run ID, trigger source, start time, and error message
- [ ] A successful run sends no email
