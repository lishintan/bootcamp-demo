export interface JiraTicket {
  id: string
  key: string
  summary: string
  description: string | null
  status: string
  labels: string[]
  created: string
  priority: string | null
  // Known custom fields discovered from Jira PF project
  impactScore: number | null       // customfield_10430
  teamName: string | null          // customfield_10523 (Team Name)
  featureName: string | null       // customfield_10427 (Feature)
  category: string | null          // customfield_10518 (Bug/Feedback)
  customerSegment: string[] | null // customfield_10435 (e.g., MVM Users)
  platform: string | null          // customfield_10510 (iOS/Android/Web)
  featureTitle: string | null      // customfield_11702 (Feature description string)
  archived: boolean                // Jira native archive flag
}

// Custom field IDs discovered from the PF project
const CUSTOM_FIELDS = {
  featureName: 'customfield_10427',      // Feature name (option with .value)
  impactScore: 'customfield_10430',      // Impact score (numeric)
  customerSegment: 'customfield_10435',  // Customer segment (array of options)
  platform: 'customfield_10510',         // Platform (option with .value)
  category: 'customfield_10518',         // Category: Bug or Feedback (option with .value)
  teamName: 'customfield_10523',         // Team name (option with .value)
  featureTitle: 'customfield_11702',     // Feature title (plain string)
  aiScore: 'customfield_12133',          // AI/secondary score (numeric)
}

const FIELDS_PARAM = [
  'summary',
  'description',
  'status',
  'labels',
  'created',
  'priority',
  ...Object.values(CUSTOM_FIELDS),
].join(',')

interface JiraSearchResponse {
  issues: JiraIssueRaw[]
  nextPageToken?: string
}

interface JiraIssueRaw {
  id: string
  key: string
  archived?: boolean
  fields: Record<string, unknown>
}

function getJiraAuth(): string {
  const email = process.env.JIRA_USER_EMAIL!
  const token = process.env.JIRA_API_TOKEN!
  return Buffer.from(`${email}:${token}`).toString('base64')
}

function extractADFText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) {
    return (n.content as unknown[]).map(extractADFText).join(' ')
  }
  return ''
}

function extractOptionValue(field: unknown): string | null {
  if (!field || typeof field !== 'object') return null
  const obj = field as Record<string, unknown>
  if (typeof obj.value === 'string') return obj.value
  return null
}

function extractOptionArray(field: unknown): string[] | null {
  if (!Array.isArray(field)) return null
  const values = (field as Record<string, unknown>[])
    .map(item => item.value)
    .filter((v): v is string => typeof v === 'string')
  return values.length > 0 ? values : null
}

function extractNumber(field: unknown): number | null {
  if (field === null || field === undefined) return null
  if (typeof field === 'number') return field
  if (typeof field === 'string') {
    const parsed = parseFloat(field)
    return isNaN(parsed) ? null : parsed
  }
  return null
}

function mapIssue(issue: JiraIssueRaw): JiraTicket {
  const f = issue.fields
  const priority = f.priority as { name?: string } | null
  const status = f.status as { name?: string } | null

  return {
    id: issue.id,
    key: issue.key,
    summary: (f.summary as string) || '',
    description: extractADFText(f.description),
    status: status?.name || 'Unknown',
    labels: Array.isArray(f.labels) ? (f.labels as string[]) : [],
    created: (f.created as string) || '',
    priority: priority?.name || null,
    impactScore: extractNumber(f[CUSTOM_FIELDS.impactScore]),
    teamName: extractOptionValue(f[CUSTOM_FIELDS.teamName]),
    featureName: extractOptionValue(f[CUSTOM_FIELDS.featureName]),
    category: extractOptionValue(f[CUSTOM_FIELDS.category]),
    customerSegment: extractOptionArray(f[CUSTOM_FIELDS.customerSegment]),
    platform: extractOptionValue(f[CUSTOM_FIELDS.platform]),
    featureTitle: typeof f[CUSTOM_FIELDS.featureTitle] === 'string'
      ? (f[CUSTOM_FIELDS.featureTitle] as string)
      : null,
    archived: issue.archived === true,
  }
}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const REDIS_CACHE_KEY = 'pid-jira-tickets-v2'
const CACHE_TTL_SECONDS = 60 * 60 // 1 hour

// In-memory fallback for when Redis is unavailable
let _memCache: { tickets: JiraTicket[]; total: number } | null = null
let _memCacheExpiry = 0

async function readRedisCache(): Promise<{ tickets: JiraTicket[]; total: number } | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const res = await fetch(`${REDIS_URL}/get/${REDIS_CACHE_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    const json = await res.json() as { result: string | null }
    if (!json.result) return null
    return JSON.parse(json.result) as { tickets: JiraTicket[]; total: number }
  } catch {
    return null
  }
}

async function writeRedisCache(data: { tickets: JiraTicket[]; total: number }): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return
  try {
    // Use pipeline to SET with EX in one request
    await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([['SET', REDIS_CACHE_KEY, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS]]),
    })
  } catch {
    // non-fatal
  }
}

export async function fetchJiraTickets(): Promise<{ tickets: JiraTicket[]; total: number }> {
  // 1. Try Redis (survives cold starts, shared across instances)
  const redisHit = await readRedisCache()
  if (redisHit) return redisHit

  // 2. Try in-memory (within same warm instance)
  if (_memCache && Date.now() < _memCacheExpiry) return _memCache

  const baseUrl = process.env.JIRA_BASE_URL!
  const auth = getJiraAuth()

  // JQL to fetch Parking Lot and Won't Do tickets from PF project
  const jql = `project=PF AND status in ("Parking Lot","Won't Do") AND NOT issue.archived = "true" ORDER BY created DESC`

  const allTickets: JiraTicket[] = []
  let nextPageToken: string | undefined
  const maxResults = 100

  do {
    const url = new URL(`${baseUrl}/rest/api/3/search/jql`)
    url.searchParams.set('jql', jql)
    url.searchParams.set('maxResults', String(maxResults))
    url.searchParams.set('fields', FIELDS_PARAM)
    if (nextPageToken) {
      url.searchParams.set('nextPageToken', nextPageToken)
    }

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!resp.ok) {
      const errorText = await resp.text()
      throw new Error(`Jira API error ${resp.status}: ${errorText}`)
    }

    const data: JiraSearchResponse = await resp.json()

    for (const issue of data.issues) {
      allTickets.push(mapIssue(issue))
    }

    nextPageToken = data.issues.length === maxResults ? data.nextPageToken : undefined
  } while (nextPageToken)

  const result = { tickets: allTickets, total: allTickets.length }

  // Persist to Redis (1-hour TTL) and warm in-memory fallback
  await writeRedisCache(result)
  _memCache = result
  _memCacheExpiry = Date.now() + CACHE_TTL_SECONDS * 1000

  return result
}

// Pick the single most comprehensive/clear quote from ticket descriptions
export function pickBestQuote(tickets: JiraTicket[]): string {
  // Filter to tickets with non-empty descriptions
  const withDesc = tickets.filter(t => t.description && t.description.trim().length > 50)

  if (withDesc.length === 0) {
    // Fall back to summaries
    const withSummary = tickets.filter(t => t.summary.length > 30)
    if (withSummary.length === 0) return 'No feedback quotes available yet.'
    // Pick longest summary
    return withSummary.sort((a, b) => b.summary.length - a.summary.length)[0].summary
  }

  // Score each description: prefer longer, more complete sentences, with higher impact scores
  const scored = withDesc.map(t => {
    const desc = t.description!.trim()
    const sentences = desc.split(/[.!?]+/).filter(s => s.trim().length > 10)
    const impactBonus = (t.impactScore ?? 0) * 20
    const score = sentences.length * 10 + Math.min(desc.length, 500) + impactBonus
    return { ticket: t, desc, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const best = scored[0].desc
  if (best.length > 300) {
    return best.substring(0, 297) + '...'
  }
  return best
}
