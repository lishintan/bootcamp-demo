import { getLatestRun } from '@/lib/pipeline'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const run = await getLatestRun()
    if (!run) {
      return Response.json({ status: 'none' })
    }
    return Response.json({
      status: run.status,
      triggeredBy: run.triggeredBy,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      ticketCount: run.ticketCount,
      groupCount: run.groupCount,
      error: run.error,
    })
  } catch (err) {
    console.error('[pipeline/status] Error:', err)
    return Response.json({ status: 'unknown' }, { status: 500 })
  }
}
