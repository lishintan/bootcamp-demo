import { fetchJiraTickets } from '@/lib/jira'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { tickets, total } = await fetchJiraTickets()
    const parkingLot = tickets.filter(t => t.status.toLowerCase() === 'parking lot').length
    const wontDo = tickets.filter(t => t.status.toLowerCase() === "won't do").length
    return Response.json({ parkingLot, wontDo, total })
  } catch {
    return Response.json({ parkingLot: 0, wontDo: 0, total: 0 })
  }
}
