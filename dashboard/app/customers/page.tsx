import staticCustomerSessions from '@/data/customer-sessions.json'
import CustomersClient from './CustomersClient'

interface CustomerAttributes {
  age: string
  lifeStage: string
  job: string
  motivation: string
  techLiteracy: string
  device: string
}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const CACHE_KEY = 'pid-customers-v1'
const CACHE_TTL = 60 * 60 * 6
const BATCH_SIZE = 20
const DEFAULTS: CustomerAttributes = {
  age: 'Unknown', lifeStage: 'Professional', job: 'Other',
  motivation: 'Personal Growth', techLiteracy: 'Medium', device: 'Mobile',
}

async function readCache(): Promise<CustomerAttributes[] | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const res = await fetch(`${REDIS_URL}/get/${CACHE_KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    const json = await res.json() as { result: string | null }
    if (!json.result) return null
    return JSON.parse(json.result) as CustomerAttributes[]
  } catch { return null }
}

async function writeCache(data: CustomerAttributes[]): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return
  try {
    await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['SET', CACHE_KEY, JSON.stringify(data), 'EX', CACHE_TTL]]),
    })
  } catch { /* non-fatal */ }
}

async function enrichBatch(summaries: string[], apiKey: string): Promise<CustomerAttributes[]> {
  const content = summaries.map((s, i) => `[${i + 1}] ${s.slice(0, 300)}`).join('\n\n')
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80 * summaries.length,
        messages: [{
          role: 'user',
          content: `Extract attributes from these ${summaries.length} Mindvalley customer profiles.\n\n${content}\n\nReturn a JSON array of exactly ${summaries.length} objects using ONLY these values:\n- age: "20s"|"30s"|"40s"|"50s"|"60s"|"70s+"|"Unknown"\n- lifeStage: "Parent"|"Student"|"Retired"|"Single"|"Entrepreneur"|"Professional"\n- job: "Coach"|"Entrepreneur"|"Educator"|"Healthcare"|"Tech"|"Corporate"|"Creative"|"Other"\n- motivation: "Personal Growth"|"Wellness"|"Learning"|"Spirituality"|"Career"|"Other"\n- techLiteracy: "Low"|"Medium"|"High"\n- device: "Mobile"|"Desktop"|"Tablet"|"Multi-device"\n\nJSON array only: [{"age":"...","lifeStage":"...","job":"...","motivation":"...","techLiteracy":"...","device":"..."}, ...]`,
        }],
      }),
    })
    if (!resp.ok) return summaries.map(() => ({ ...DEFAULTS }))
    const data = await resp.json() as { content: { type: string; text: string }[] }
    const text = data.content?.[0]?.text ?? ''
    const match = text.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(match?.[0] ?? '[]') as Partial<CustomerAttributes>[]
    return summaries.map((_, i) => ({
      age: parsed[i]?.age || DEFAULTS.age,
      lifeStage: parsed[i]?.lifeStage || DEFAULTS.lifeStage,
      job: parsed[i]?.job || DEFAULTS.job,
      motivation: parsed[i]?.motivation || DEFAULTS.motivation,
      techLiteracy: parsed[i]?.techLiteracy || DEFAULTS.techLiteracy,
      device: parsed[i]?.device || DEFAULTS.device,
    }))
  } catch {
    return summaries.map(() => ({ ...DEFAULTS }))
  }
}

async function getEnrichedAttributes(summaries: string[]): Promise<CustomerAttributes[]> {
  const cached = await readCache()
  if (cached && cached.length === summaries.length) return cached

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return summaries.map(() => ({ ...DEFAULTS }))

  const batches: string[][] = []
  for (let i = 0; i < summaries.length; i += BATCH_SIZE) {
    batches.push(summaries.slice(i, i + BATCH_SIZE))
  }
  const results = await Promise.all(batches.map(b => enrichBatch(b, apiKey)))
  const attributes = results.flat()
  await writeCache(attributes)
  return attributes
}

export default async function CustomersPage() {
  const records = staticCustomerSessions as {
    id: string
    customerName: string
    segment: string
    location: { id?: string; name: string; color?: string }
    sessionStatus: string
    summary: string
  }[]

  const summaries = records.map(r => r.summary ?? '')
  const attributes = await getEnrichedAttributes(summaries)

  const enrichedRecords = records.map((r, i) => ({ ...r, attributes: attributes[i] }))

  return <CustomersClient records={enrichedRecords} />
}
