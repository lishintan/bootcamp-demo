import { fetchJiraTickets } from '@/lib/jira'
import { clusterTickets } from '@/lib/clustering'
import type { InsightGroup } from '@/lib/clustering'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const CLUSTER_CACHE_KEY = 'pid-clusters-v5'
const CLUSTER_CACHE_TTL = 3600

interface CachedPayload {
  groups: InsightGroup[]
  total: number
  parkingLot: number
  wontDo: number
}

async function readClusterCache(): Promise<CachedPayload | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const res = await fetch(`${REDIS_URL}/get/${CLUSTER_CACHE_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    const json = await res.json() as { result: string | null }
    if (!json.result) return null
    return JSON.parse(json.result) as CachedPayload
  } catch {
    return null
  }
}

async function writeClusterCache(data: CachedPayload): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return
  try {
    await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([['SET', CLUSTER_CACHE_KEY, JSON.stringify(data), 'EX', CLUSTER_CACHE_TTL]]),
    })
  } catch {
    // non-fatal
  }
}

function slimForCache(groups: InsightGroup[]): InsightGroup[] {
  return groups.map(g => ({
    ...g,
    representativeTicket: { ...g.representativeTicket, description: null },
    tickets: g.tickets.map(t => ({ ...t, description: null })),
  }))
}

function applyFilters(
  groups: InsightGroup[],
  statusFilter: string | null,
  teamFilter: string | null,
  categoryFilter: string | null,
): InsightGroup[] {
  let result = groups
  if (statusFilter === 'parking_lot') {
    result = result.filter(g => g.tickets.some(t => t.status.toLowerCase() === 'parking lot'))
  } else if (statusFilter === 'wont_do') {
    result = result.filter(g => g.tickets.some(t => t.status.toLowerCase() === "won't do"))
  }
  if (teamFilter) {
    result = result.filter(g => g.teamName?.toLowerCase() === teamFilter.toLowerCase())
  }
  if (categoryFilter === 'Bug' || categoryFilter === 'Feedback') {
    result = result.filter(g => g.category === categoryFilter)
  }
  return result
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const statusFilter = searchParams.get('status')
    const categoryFilter = searchParams.get('category')
    const teamFilter = searchParams.get('team')

    // Check cache BEFORE fetching Jira tickets — cache hit skips all slow work
    const cached = await readClusterCache()
    if (cached) {
      const groups = applyFilters(cached.groups, statusFilter, teamFilter, categoryFilter)
      return Response.json({ groups, total: cached.total, parkingLot: cached.parkingLot, wontDo: cached.wontDo })
    }

    // Cache miss — fetch tickets and cluster
    const { tickets, total } = await fetchJiraTickets()
    const parkingLot = tickets.filter(t => t.status.toLowerCase() === 'parking lot').length
    const wontDo = tickets.filter(t => t.status.toLowerCase() === "won't do").length

    const aiProvider = process.env.ANTHROPIC_API_KEY ? 'claude' : 'none'
    const allGroups = await clusterTickets(tickets, aiProvider)

    await writeClusterCache({ groups: slimForCache(allGroups), total, parkingLot, wontDo })

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
