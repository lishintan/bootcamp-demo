import { getDb } from './db'
import { ensureSchema } from './schema'
import { fetchJiraTickets } from './jira'
import { clusterTickets } from './clustering'
import type { JiraTicket } from './jira'
import type { InsightGroup } from './clustering'

export type PipelineStatus = 'running' | 'completed' | 'failed'

export interface PipelineRun {
  id: string
  triggeredBy: string
  status: PipelineStatus
  startedAt: string
  completedAt: string | null
  ticketCount: number | null
  groupCount: number | null
  error: string | null
}

// Returns the latest pipeline run regardless of status, or null if none exists.
export async function getLatestRun(): Promise<PipelineRun | null> {
  await ensureSchema()
  const sql = getDb()
  const rows = await sql<PipelineRun[]>`
    SELECT id, triggered_by, status, started_at, completed_at, ticket_count, group_count, error
    FROM pipeline_runs
    ORDER BY started_at DESC
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getRunningRun(): Promise<PipelineRun | null> {
  await ensureSchema()
  const sql = getDb()
  const rows = await sql<PipelineRun[]>`
    SELECT id, triggered_by, status, started_at, completed_at, ticket_count, group_count, error
    FROM pipeline_runs
    WHERE status = 'running'
    LIMIT 1
  `
  return rows[0] ?? null
}

// Kicks off the full pipeline. Call without await to fire-and-forget.
export async function runPipeline(triggeredBy: 'schedule' | 'manual', runId: string): Promise<void> {
  const sql = getDb()

  try {
    const { tickets, total } = await fetchJiraTickets()
    const aiProvider = process.env.GEMINI_API_KEY ? 'gemini' : 'none'
    const groups = await clusterTickets(tickets, aiProvider)

    // Write tickets in batches of 100
    const BATCH = 100
    for (let i = 0; i < tickets.length; i += BATCH) {
      const batch = tickets.slice(i, i + BATCH)
      const rows = batch.map(ticketRow(runId))
      await sql`INSERT INTO jira_tickets ${sql(rows)}`
    }

    // Write groups
    if (groups.length > 0) {
      const rows = groups.map(groupRow(runId))
      await sql`INSERT INTO insight_groups ${sql(rows)}`
    }

    await sql`
      UPDATE pipeline_runs
      SET status = 'completed', completed_at = now(),
          ticket_count = ${total}, group_count = ${groups.length}
      WHERE id = ${runId}
    `

    // Prune ticket + group data older than 7 days (keep pipeline_run audit rows)
    await sql`
      DELETE FROM pipeline_runs
      WHERE id IN (
        SELECT id FROM pipeline_runs
        WHERE status = 'completed'
          AND completed_at < now() - INTERVAL '7 days'
          AND id != ${runId}
      )
    `
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await sql`
      UPDATE pipeline_runs
      SET status = 'failed', completed_at = now(), error = ${message}
      WHERE id = ${runId}
    `.catch(() => {}) // non-fatal — don't mask original error
    throw err
  }
}

// Starts a new run, returns the run ID. Throws if a run is already in progress.
export async function startPipeline(triggeredBy: 'schedule' | 'manual'): Promise<string> {
  await ensureSchema()
  const sql = getDb()

  const running = await getRunningRun()
  if (running) throw new Error('PIPELINE_ALREADY_RUNNING')

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO pipeline_runs (triggered_by, status, started_at)
    VALUES (${triggeredBy}, 'running', now())
    RETURNING id
  `
  return row.id
}

// ─── Row mappers ───────────────────────────────────────────────────────────────

function ticketRow(runId: string) {
  return (t: JiraTicket) => ({
    key: t.key,
    run_id: runId,
    jira_id: t.id,
    summary: t.summary ?? null,
    description: t.description ? t.description.slice(0, 10000) : null,
    status: t.status ?? null,
    labels: t.labels ?? [],
    created: t.created ?? null,
    updated: t.updated ?? null,
    priority: t.priority ?? null,
    impact_score: t.impactScore ?? null,
    team_name: t.teamName ?? null,
    feature_name: t.featureName ?? null,
    category: t.category ?? null,
    customer_segment: t.customerSegment ?? null,
    platform: t.platform ?? null,
    feature_title: t.featureTitle ?? null,
    archived: t.archived ?? false,
  })
}

function groupRow(runId: string) {
  return (g: InsightGroup) => ({
    id: g.id,
    run_id: runId,
    title: g.title ?? null,
    ai_summary: g.aiSummary ?? null,
    hook: g.hook ?? null,
    category: g.category,
    team_name: g.teamName ?? null,
    feature_name: g.featureName ?? null,
    frequency: g.frequency,
    impact_score: g.impactScore ?? null,
    recency: g.recency ?? null,
    temperature: g.temperature,
    temperature_score: g.temperatureScore,
    why_tag: g.whyTag ?? null,
    sources: g.sources ?? [],
    ticket_keys: g.tickets.map(t => t.key),
    representative_ticket_key: g.representativeTicket.key,
  })
}
