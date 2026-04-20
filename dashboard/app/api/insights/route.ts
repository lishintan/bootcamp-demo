import { fetchJiraTickets } from '@/lib/jira'
import { clusterTickets } from '@/lib/clustering'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

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
    let groups = clusterTickets(filtered, aiProvider)

    // Apply category filter after clustering (clusters are already per-category)
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
