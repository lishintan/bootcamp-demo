---
title: 'Insights Database Persistence'
slug: 'insights-database-persistence'
scope: feature
status: draft
parent: product-intelligence-dashboard.md
children: []
created: 2026-05-15
updated: 2026-05-15
resolution: 7/7
status: resolved
---

# Insights Database Persistence

> Part of [Product Intelligence Dashboard](../product-intelligence-dashboard.md)

## Purpose

The insights pipeline (Jira fetch → AI clustering → enrichment) takes ~5 minutes to run. Cloud Run spins down the container between sessions, destroying the in-memory cache every time a user returns to the app. The Redis cache should catch cold starts, but in practice every session triggers a full regeneration — making the app unusable for quick reference.

The fix: persist generated insight groups to a database after each pipeline run, and serve every dashboard request directly from the database. The pipeline only runs on a daily schedule, not on user demand.

## Behavior

### Serving requests
Every `/api/insights` request reads directly from the database. No AI pipeline runs on user demand. Load time drops from ~5 minutes to under 1 second.

### Daily pipeline run
The pipeline runs on two triggers:
1. **Scheduled** — automatically at a fixed time each night (time TBD)
2. **Manual** — a "Refresh Insights" button in the dashboard that any PM can trigger on demand

While the pipeline is running, the dashboard continues to serve the previous day's data uninterrupted. When the run completes, the database is updated and subsequent requests serve the fresh data. No page reload is forced — users see the new data on their next navigation or manual refresh.

### Pipeline output
After clustering and enrichment complete, all insight groups are written to the database, replacing the previous snapshot. This is a full replace (not incremental) — the daily run always produces a complete, authoritative set of insight groups.

## Rules & Logic

- The dashboard API reads exclusively from the database — it never triggers the AI pipeline on a user request.
- Only one pipeline run may execute at a time. If a manual trigger fires while the scheduled run is in progress (or vice versa), the second trigger is rejected with a clear message.
- The database always serves from the **latest completed run**. A run that is still `running` or has `failed` does not replace the previous completed snapshot.
- After a successful run, old run data is retained for **7 days** then pruned (tickets and groups for expired runs are deleted; the pipeline_run audit row is kept permanently).
- The daily schedule fires once per day at a fixed time (exact time TBD — likely 2am MYT to avoid business hours).

## Data

**Database:** Postgres via Kessel `db` (Cloud SQL, attached to the Cloud Run service).

**Tables:**

`pipeline_runs` — audit log of every execution
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| triggered_by | TEXT | `'schedule'` or `'manual'` |
| status | TEXT | `'running'` / `'completed'` / `'failed'` |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | nullable |
| ticket_count | INT | total Jira tickets fetched |
| group_count | INT | insight groups produced |
| error | TEXT | nullable — error message if failed |

`jira_tickets` — raw Jira ticket snapshot per run
| Column | Type | Notes |
|---|---|---|
| key | TEXT | e.g. `PF-1234` |
| run_id | UUID FK | → pipeline_runs.id |
| summary | TEXT | |
| description | TEXT | nullable |
| status | TEXT | |
| labels | JSONB | |
| created | TIMESTAMPTZ | |
| updated | TIMESTAMPTZ | |
| impact_score | FLOAT | nullable |
| team_name | TEXT | nullable |
| feature_name | TEXT | nullable |
| category | TEXT | nullable |
| platform | TEXT | nullable |
| archived | BOOLEAN | |
| PRIMARY KEY | (key, run_id) | |

`insight_groups` — one row per insight card per run
| Column | Type | Notes |
|---|---|---|
| id | TEXT | representative ticket key |
| run_id | UUID FK | → pipeline_runs.id |
| title | TEXT | AI-generated |
| ai_summary | TEXT | AI-generated |
| hook | TEXT | |
| category | TEXT | `'Bug'` or `'Feedback'` |
| team_name | TEXT | |
| feature_name | TEXT | |
| frequency | INT | number of tickets in group |
| impact_score | FLOAT | |
| recency | TIMESTAMPTZ | most recent ticket updated date |
| temperature | TEXT | `'Hot'` / `'Medium'` / `'Cold'` |
| temperature_score | INT | |
| why_tag | TEXT | |
| sources | JSONB | array of label strings |
| ticket_keys | JSONB | ordered array of ticket keys in this group |
| PRIMARY KEY | (id, run_id) | |

## Failure Modes

| Failure | Behaviour |
|---|---|
| Pipeline run fails (any stage) | Dashboard continues serving last successful snapshot; run is marked `failed` in pipeline_runs; email alert sent |
| Jira API unavailable | Run aborts immediately, marked `failed`; email alert sent |
| Gemini quota exceeded | Run aborts, marked `failed`; email alert sent |
| Database unavailable on read | API returns a 503 with a user-visible error state; no silent empty response |
| Manual trigger while run in progress | Request rejected with a clear message; no second run started |
| No completed run exists yet (fresh deploy) | API falls back to the Redis cache or triggers a one-time blocking run on first request |

**Alert:** On any `failed` run, send an email to `lishin.tan@mindvalley.com` with the run ID, triggered_by, started_at, and the error message.

## Acceptance Criteria

- [ ] Dashboard loads insights in under 3 seconds on a cold Cloud Run start
- [ ] Insight groups, ticket keys, and report counts match what was stored after the last pipeline run
- [ ] A scheduled run completes successfully and updates the database without manual intervention
- [ ] A manual "Refresh Insights" button in the dashboard triggers a new run; the button is disabled while a run is in progress
- [ ] While a run is in progress, the dashboard continues to display the previous snapshot without any loading spinner or disruption
- [ ] A failed run sends an email to `lishin.tan@mindvalley.com` containing run ID, trigger source, start time, and error message
- [ ] A second trigger (manual or scheduled) is rejected while a run is already running
- [ ] Ticket data older than 7 days (by run date) is pruned automatically
- [ ] The Jira ticket raw data (key, summary, description, labels, team, feature, category) is queryable in Postgres for each run

## Open Questions

None — all resolved.

**Resolved:**
- **Schedule:** Daily at 9am GMT+8 (1am UTC) — cron `0 1 * * *`
- **Email mechanism:** SendGrid — free API key, no personal credentials required. Sends from a system `noreply@` address to `lishin.tan@mindvalley.com`. `SENDGRID_API_KEY` added as a Kessel env var.
- **Refresh button:** Visible to all dashboard users
