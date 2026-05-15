import { getDb } from '@/lib/db'
import { ensureSchema } from '@/lib/schema'
import type { InsightGroup } from '@/lib/clustering'
import type { JiraTicket } from '@/lib/jira'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function applyFilters(
  groups: InsightGroup[],
  statusFilter: string | null,
  teamFilter: string | null,
  categoryFilter: string | null,
): InsightGroup[] {
  let result = groups
  if (statusFilter === 'parking_lot') {
    result = result
      .map(g => ({ ...g, tickets: g.tickets.filter(t => t.status.toLowerCase() === 'parking lot') }))
      .filter(g => g.tickets.length > 0)
      .map(g => ({ ...g, frequency: g.tickets.length }))
  } else if (statusFilter === 'wont_do') {
    result = result
      .map(g => ({ ...g, tickets: g.tickets.filter(t => t.status.toLowerCase() === "won't do") }))
      .filter(g => g.tickets.length > 0)
      .map(g => ({ ...g, frequency: g.tickets.length }))
  }
  if (teamFilter) {
    result = result.filter(g => g.teamName?.toLowerCase() === teamFilter.toLowerCase())
  }
  if (categoryFilter === 'Bug' || categoryFilter === 'Feedback') {
    result = result.filter(g => g.category === categoryFilter)
  }
  result = result.filter(g => g.frequency >= 2)
  return result
}

// ─── DB row types ─────────────────────────────────────────────────────────────

interface TicketRow {
  key: string
  runId: string
  jiraId: string | null
  summary: string | null
  description: string | null
  status: string | null
  labels: string[]
  created: Date | null
  updated: Date | null
  priority: string | null
  impactScore: number | null
  teamName: string | null
  featureName: string | null
  category: string | null
  customerSegment: string[] | null
  platform: string | null
  featureTitle: string | null
  archived: boolean
}

interface GroupRow {
  id: string
  runId: string
  title: string | null
  aiSummary: string | null
  hook: string | null
  category: string
  teamName: string | null
  featureName: string | null
  frequency: number
  impactScore: number | null
  recency: Date | null
  temperature: string
  temperatureScore: number
  whyTag: string
  sources: string[]
  ticketKeys: string[]
  representativeTicketKey: string | null
}

function rowToJiraTicket(row: TicketRow): JiraTicket {
  const toIso = (d: Date | string | null) =>
    d ? (d instanceof Date ? d.toISOString() : d) : new Date().toISOString()
  return {
    id: row.jiraId ?? row.key,
    key: row.key,
    summary: row.summary ?? '',
    description: row.description,
    status: row.status ?? '',
    labels: row.labels ?? [],
    created: toIso(row.created),
    updated: toIso(row.updated),
    priority: row.priority,
    impactScore: row.impactScore,
    teamName: row.teamName,
    featureName: row.featureName,
    category: row.category,
    customerSegment: row.customerSegment,
    platform: row.platform,
    featureTitle: row.featureTitle,
    archived: row.archived ?? false,
  }
}

function rowToInsightGroup(group: GroupRow, ticketMap: Map<string, JiraTicket>): InsightGroup {
  const tickets = (group.ticketKeys ?? [])
    .map(k => ticketMap.get(k))
    .filter((t): t is JiraTicket => t != null)

  const repTicket =
    (group.representativeTicketKey ? ticketMap.get(group.representativeTicketKey) : null) ??
    tickets[0] ??
    ({ key: group.id, summary: group.title ?? '', description: null, status: '', labels: [],
       created: '', updated: '', priority: null, impactScore: null, teamName: group.teamName,
       featureName: group.featureName, category: group.category, customerSegment: null,
       platform: null, featureTitle: null, archived: false, id: group.id } as JiraTicket)

  const toIso = (d: Date | string | null) =>
    d ? (d instanceof Date ? d.toISOString() : d) : new Date().toISOString()

  return {
    id: group.id,
    representativeTicket: repTicket,
    tickets,
    frequency: group.frequency,
    category: group.category as 'Bug' | 'Feedback',
    teamName: group.teamName ?? '',
    featureName: group.featureName ?? '',
    sources: group.sources ?? [],
    impactScore: group.impactScore ?? 0,
    recency: toIso(group.recency),
    temperature: group.temperature as 'Hot' | 'Medium' | 'Cold',
    temperatureScore: group.temperatureScore,
    hook: group.hook ?? '',
    title: group.title ?? '',
    aiSummary: group.aiSummary ?? '',
    whyTag: group.whyTag as 'Friction' | 'Wishlist' | 'Retention' | 'Revenue',
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const statusFilter = searchParams.get('status')
    const categoryFilter = searchParams.get('category')
    const teamFilter = searchParams.get('team')

    await ensureSchema()
    const sql = getDb()

    // Find the latest completed run
    const [latestRun] = await sql<{ id: string; ticketCount: number }[]>`
      SELECT id, ticket_count
      FROM pipeline_runs
      WHERE status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `

    if (!latestRun) {
      return Response.json({
        groups: [],
        total: 0,
        parkingLot: 0,
        wontDo: 0,
        bootstrapping: true,
      })
    }

    const runId = latestRun.id

    // Fetch all tickets and groups for this run in parallel
    const [ticketRows, groupRows] = await Promise.all([
      sql<TicketRow[]>`SELECT * FROM jira_tickets WHERE run_id = ${runId}`,
      sql<GroupRow[]>`SELECT * FROM insight_groups WHERE run_id = ${runId}`,
    ])

    const ticketMap = new Map(ticketRows.map(r => [r.key, rowToJiraTicket(r)]))

    const allGroups: InsightGroup[] = groupRows.map(g => rowToInsightGroup(g, ticketMap))

    const total = latestRun.ticketCount ?? ticketRows.length
    const parkingLot = ticketRows.filter(t => t.status?.toLowerCase() === 'parking lot').length
    const wontDo = ticketRows.filter(t => t.status?.toLowerCase() === "won't do").length

    const groups = applyFilters(allGroups, statusFilter, teamFilter, categoryFilter)

    return Response.json({ groups, total, parkingLot, wontDo })
  } catch (error) {
    console.error('[API /api/insights] Error:', error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
