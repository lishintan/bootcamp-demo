import { fetchJiraTickets } from '@/lib/jira'
import { clusterTickets } from '@/lib/clustering'
import type { InsightGroup } from '@/lib/clustering'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const CLUSTER_CACHE_KEY = 'pid-clusters-v2'
const CLUSTER_CACHE_TTL = 3600

async function readClusterCache(): Promise<InsightGroup[] | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const res = await fetch(`${REDIS_URL}/get/${CLUSTER_CACHE_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    const json = await res.json() as { result: string | null }
    if (!json.result) return null
    return JSON.parse(json.result) as InsightGroup[]
  } catch {
    return null
  }
}

async function writeClusterCache(data: InsightGroup[]): Promise<void> {
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const statusFilter = searchParams.get('status') // 'parking_lot' | 'wont_do'
    const categoryFilter = searchParams.get('category') // 'Bug' | 'Feedback'
    const teamFilter = searchParams.get('team') // team name string

    const { tickets, total } = await fetchJiraTickets()

    const parkingLot = tickets.filter(
      t => t.status.toLowerCase() === 'parking lot',
    ).length
    const wontDo = tickets.filter(
      t => t.status.toLowerCase() === "won't do",
    ).length

    // Apply status filter
    let filtered = tickets
    if (statusFilter === 'parking_lot') {
      filtered = tickets.filter(t => t.status.toLowerCase() === 'parking lot')
    } else if (statusFilter === 'wont_do') {
      filtered = tickets.filter(t => t.status.toLowerCase() === "won't do")
    }

    // Apply team filter
    if (teamFilter) {
      filtered = filtered.filter(
        t => t.teamName?.toLowerCase() === teamFilter.toLowerCase(),
      )
    }

    const aiProvider = process.env.AI_PROVIDER ?? 'none'

    // Try cluster Redis cache first
    let groups: InsightGroup[]
    const cachedGroups = await readClusterCache()
    if (cachedGroups) {
      // Apply status/team/category filters on cached data
      let fromCache = cachedGroups
      if (statusFilter === 'parking_lot') {
        fromCache = fromCache.filter(g =>
          g.tickets.some(t => t.status.toLowerCase() === 'parking lot'),
        )
      } else if (statusFilter === 'wont_do') {
        fromCache = fromCache.filter(g =>
          g.tickets.some(t => t.status.toLowerCase() === "won't do"),
        )
      }
      if (teamFilter) {
        fromCache = fromCache.filter(
          g => g.teamName?.toLowerCase() === teamFilter.toLowerCase(),
        )
      }
      if (categoryFilter === 'Bug' || categoryFilter === 'Feedback') {
        fromCache = fromCache.filter(g => g.category === categoryFilter)
      }
      return Response.json({ groups: fromCache, total, parkingLot, wontDo })
    }

    // Cluster ALL tickets (both statuses) so cache covers both tabs
    const allGroups = await clusterTickets(tickets, aiProvider)
    await writeClusterCache(allGroups)

    // Apply filters for this request
    groups = allGroups
    if (statusFilter === 'parking_lot') {
      groups = groups.filter(g => g.tickets.some(t => t.status.toLowerCase() === 'parking lot'))
    } else if (statusFilter === 'wont_do') {
      groups = groups.filter(g => g.tickets.some(t => t.status.toLowerCase() === "won't do"))
    }
    if (teamFilter) {
      groups = groups.filter(g => g.teamName?.toLowerCase() === teamFilter.toLowerCase())
    }
    if (categoryFilter === 'Bug' || categoryFilter === 'Feedback') {
      groups = groups.filter(g => g.category === categoryFilter)
    }

    return Response.json({
      groups,
      total,
      parkingLot,
      wontDo,
    })
  } catch (error) {
    console.error('[API /api/insights] Error:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
