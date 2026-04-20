import { fetchJiraTickets } from '@/lib/jira'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await fetchJiraTickets()
    return Response.json({
      success: true,
      total: result.total,
      fetched: result.tickets.length,
      tickets: result.tickets,
    })
  } catch (error) {
    console.error('[API /api/jira] Error:', error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
