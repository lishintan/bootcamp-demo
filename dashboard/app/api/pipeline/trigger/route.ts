import { startPipeline, runPipeline } from '@/lib/pipeline'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST() {
  try {
    const runId = await startPipeline('manual')

    // Fire pipeline without awaiting — returns 202 immediately.
    // The container stays alive because the UI polls /api/pipeline/status.
    runPipeline('manual', runId).catch(err => {
      console.error('[pipeline/trigger] Pipeline failed:', err)
    })

    return Response.json({ runId, status: 'started' }, { status: 202 })
  } catch (err) {
    if (err instanceof Error && err.message === 'PIPELINE_ALREADY_RUNNING') {
      return Response.json({ error: 'A refresh is already in progress.' }, { status: 409 })
    }
    console.error('[pipeline/trigger] Error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
