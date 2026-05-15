---
title: 'Insights Database Persistence'
slug: 'insights-database-persistence'
scope: feature
status: draft
parent: product-intelligence-dashboard.md
children: []
created: 2026-05-15
updated: 2026-05-15
resolution: 1/7
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

[UNRESOLVED]

## Data

[UNRESOLVED]

## Failure Modes

[UNRESOLVED]

## Acceptance Criteria

[UNRESOLVED]

## Open Questions

[UNRESOLVED]
