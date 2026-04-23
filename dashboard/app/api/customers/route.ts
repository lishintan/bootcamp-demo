import { fetchCustomerResearch } from '@/lib/airtable'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const CACHE_KEY = 'pid-customers-v1'
const CACHE_TTL = 60 * 60 * 6 // 6 hours
const BATCH_SIZE = 20

interface CustomerAttributes {
  age: string
  lifeStage: string
  job: string
  motivation: string
  techLiteracy: string
  device: string
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
  const content = summaries.map((s, i) =>
    `[${i + 1}] ${s.slice(0, 300)}`
  ).join('\n\n')

  const defaults: CustomerAttributes = { age: 'Unknown', lifeStage: 'Professional', job: 'Other', motivation: 'Personal Growth', techLiteracy: 'Medium', device: 'Mobile' }

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
          content: `Extract attributes from these ${summaries.length} Mindvalley customer profiles. For each numbered profile, return structured JSON.

${content}

Return a JSON array of exactly ${summaries.length} objects. Each object must use ONLY these exact values:
- age: "20s" | "30s" | "40s" | "50s" | "60s" | "70s+" | "Unknown"
- lifeStage: "Parent" | "Student" | "Retired" | "Single" | "Entrepreneur" | "Professional"
- job: "Coach" | "Entrepreneur" | "Educator" | "Healthcare" | "Tech" | "Corporate" | "Creative" | "Other"
- motivation: "Personal Growth" | "Wellness" | "Learning" | "Spirituality" | "Career" | "Other"
- techLiteracy: "Low" | "Medium" | "High"
- device: "Mobile" | "Desktop" | "Tablet" | "Multi-device"

JSON array only, no explanation: [{"age":"...","lifeStage":"...","job":"...","motivation":"...","techLiteracy":"...","device":"..."}, ...]`,
        }],
      }),
    })

    if (!resp.ok) return summaries.map(() => ({ ...defaults }))

    const data = await resp.json() as { content: { type: string; text: string }[] }
    const text = data.content?.[0]?.text ?? ''
    const match = text.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(match?.[0] ?? '[]') as Partial<CustomerAttributes>[]

    return summaries.map((_, i) => ({
      age: parsed[i]?.age || defaults.age,
      lifeStage: parsed[i]?.lifeStage || defaults.lifeStage,
      job: parsed[i]?.job || defaults.job,
      motivation: parsed[i]?.motivation || defaults.motivation,
      techLiteracy: parsed[i]?.techLiteracy || defaults.techLiteracy,
      device: parsed[i]?.device || defaults.device,
    }))
  } catch {
    return summaries.map(() => ({ ...defaults }))
  }
}

async function enrichCustomers(summaries: string[]): Promise<CustomerAttributes[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return summaries.map(() => ({
    age: 'Unknown', lifeStage: 'Professional', job: 'Other',
    motivation: 'Personal Growth', techLiteracy: 'Medium', device: 'Mobile',
  }))

  const batches: string[][] = []
  for (let i = 0; i < summaries.length; i += BATCH_SIZE) {
    batches.push(summaries.slice(i, i + BATCH_SIZE))
  }

  const results = await Promise.all(batches.map(b => enrichBatch(b, apiKey)))
  return results.flat()
}

export async function GET(_req: NextRequest) {
  try {
    const result = await fetchCustomerResearch()
    const records = result.records

    // Try cache first
    const cached = await readCache()
    if (cached && cached.length === records.length) {
      return Response.json({
        success: true,
        total: result.total,
        source: result.source,
        records: records.map((r, i) => ({ ...r, attributes: cached[i] })),
      })
    }

    // Enrich and cache
    const summaries = records.map(r => r.summary ?? '')
    const attributes = await enrichCustomers(summaries)
    await writeCache(attributes)

    return Response.json({
      success: true,
      total: result.total,
      source: result.source,
      records: records.map((r, i) => ({ ...r, attributes: attributes[i] })),
    })
  } catch (error) {
    console.error('[API /api/customers] Error:', error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
