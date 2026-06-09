-- Migration 001: initial schema
-- Run against Cloud SQL with:
--   psql "$DATABASE_URL" -f migrations/001_initial_schema.sql
-- Or via Cloud SQL proxy:
--   cloud-sql-proxy mv-ai-gateway:asia-southeast1:cloudsql-asse1-mv-kessel-apps-fccf1fe4 &
--   psql "postgresql://demo_dashboard_usr:<password>@localhost/demo_dashboard_dev" -f migrations/001_initial_schema.sql

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  ticket_count    INT,
  group_count     INT,
  error           TEXT
);

CREATE TABLE IF NOT EXISTS jira_tickets (
  key              TEXT NOT NULL,
  run_id           UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  jira_id          TEXT,
  summary          TEXT,
  description      TEXT,
  status           TEXT,
  labels           JSONB    DEFAULT '[]',
  created          TIMESTAMPTZ,
  updated          TIMESTAMPTZ,
  priority         TEXT,
  impact_score     FLOAT,
  team_name        TEXT,
  feature_name     TEXT,
  category         TEXT,
  customer_segment JSONB,
  platform         TEXT,
  feature_title    TEXT,
  archived         BOOLEAN  DEFAULT false,
  PRIMARY KEY (key, run_id)
);

CREATE INDEX IF NOT EXISTS jira_tickets_run_id_idx ON jira_tickets(run_id);

CREATE TABLE IF NOT EXISTS insight_groups (
  id                        TEXT NOT NULL,
  run_id                    UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  title                     TEXT,
  ai_summary                TEXT,
  hook                      TEXT,
  category                  TEXT,
  team_name                 TEXT,
  feature_name              TEXT,
  frequency                 INT,
  impact_score              FLOAT,
  recency                   TIMESTAMPTZ,
  temperature               TEXT,
  temperature_score         INT,
  why_tag                   TEXT,
  sources                   JSONB DEFAULT '[]',
  ticket_keys               JSONB DEFAULT '[]',
  representative_ticket_key TEXT,
  PRIMARY KEY (id, run_id)
);

CREATE INDEX IF NOT EXISTS insight_groups_run_id_idx ON insight_groups(run_id);
