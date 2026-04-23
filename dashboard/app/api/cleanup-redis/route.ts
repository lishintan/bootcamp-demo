export const dynamic = 'force-dynamic'

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

const OLD_KEYS = [
  'pid-jira-tickets',
  'pid-jira-tickets-v2',
  'pid-jira-tickets-v3',
  'pid-jira-tickets-v4',
  'pid-jira-tickets-v5',
  'pid-clusters-v2',
  'pid-clusters-v3',
  'pid-clusters-v4',
  'pid-clusters-v5',
  'pid-clusters-v6',
  'pid-clusters-v7',
  'pid-clusters-v8',
  'pid-clusters-v9',
  'pid-clusters-v10',
  'pid-customers-v1',
]

export async function GET() {
  if (!REDIS_URL || !REDIS_TOKEN) return Response.json({ error: 'Redis not configured' }, { status: 500 })

  const results: Record<string, string> = {}
  for (const key of OLD_KEYS) {
    try {
      const res = await fetch(`${REDIS_URL}/del/${key}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      })
      const json = await res.json() as { result: number }
      results[key] = json.result === 1 ? 'deleted' : 'not found'
    } catch {
      results[key] = 'error'
    }
  }
  return Response.json({ cleaned: results })
}
