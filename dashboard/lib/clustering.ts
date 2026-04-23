import type { JiraTicket } from './jira'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InsightGroup {
  id: string                     // representative ticket key (e.g. PF-1234)
  representativeTicket: JiraTicket
  tickets: JiraTicket[]          // all tickets in the group
  frequency: number              // tickets.length
  category: 'Bug' | 'Feedback'
  teamName: string               // from representative ticket
  featureName: string            // from representative ticket
  sources: string[]              // unique label values across all tickets
  impactScore: number            // average impact score across group
  recency: string                // ISO date of most recent ticket in group
  temperature: 'Hot' | 'Medium' | 'Cold'
  temperatureScore: number       // 0–100
  hook: string                   // 1-sentence summary
  title: string                  // AI-generated 6-10 word headline
  aiSummary: string              // AI-generated 2-sentence summary
  whyTag: 'Friction' | 'Wishlist' | 'Retention' | 'Revenue'
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WHY_TAG_KEYWORDS: Record<'Friction' | 'Wishlist' | 'Retention' | 'Revenue', string[]> = {
  Friction: [
    'error', 'bug', 'broken', 'crash', 'fail', 'slow', "can't", 'cannot',
    "doesn't work", 'issue', 'problem', 'confusing', 'unclear', 'hard to', 'difficult',
  ],
  Wishlist: [
    'love', 'great', 'amazing', 'excellent', 'wish', 'would love', 'want',
    'feature request', 'add', 'improve', 'enhance', 'better',
  ],
  Retention: [
    'cancel', 'churn', 'refund', 'leaving', 'unsubscribe', 'quit',
    'disappointed', 'not worth', 'expensive',
  ],
  Revenue: [
    'price', 'cost', 'upgrade', 'premium', 'subscription', 'pay',
    'purchase', 'billing', 'plan',
  ],
}

const ENRICH_BATCH_SIZE = 20
const ENRICH_TOP_N = 25
const AI_BATCH_SIZE = 50  // max tickets per AI clustering call

// ─── AI semantic clustering ───────────────────────────────────────────────────

function normaliseClusterResult(parsed: number[][], n: number): number[][] {
  const seen = new Set<number>()
  const result: number[][] = []
  for (const group of parsed) {
    if (!Array.isArray(group)) continue
    const valid = group.filter(
      idx => typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < n && !seen.has(idx),
    )
    for (const idx of valid) seen.add(idx)
    if (valid.length > 0) result.push(valid)
  }
  for (let i = 0; i < n; i++) {
    if (!seen.has(i)) result.push([i])
  }
  return result
}

async function aiClusterSingle(
  tickets: JiraTicket[],
  category: 'Bug' | 'Feedback',
  apiKey: string,
): Promise<number[][]> {
  if (tickets.length <= 1) return tickets.map((_, i) => [i])

  const lines = tickets.map((t, i) => {
    const desc = t.description?.trim().slice(0, 120) ?? ''
    return `[${i}] ${t.summary}${desc ? ' — ' + desc : ''}`
  }).join('\n')

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
        max_tokens: Math.min(tickets.length * 30 + 500, 8192),
        messages: [{
          role: 'user',
          content: `Group these ${tickets.length} product ${category.toLowerCase()} tickets by semantic meaning. Tickets about the same underlying problem or request — even if worded differently — MUST be in the same group. Be aggressive: if two tickets share the same root cause or theme, group them together.

${lines}

Return ONLY a JSON array of arrays. Each inner array = one group (ticket indices). Every ticket must appear exactly once.
Format: [[0,3],[1],[2,4,7],[5],[6]]`,
        }],
      }),
    })

    if (!resp.ok) return tickets.map((_, i) => [i])

    const data = await resp.json() as { content: { type: string; text: string }[] }
    const text = data.content?.[0]?.text ?? ''
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return tickets.map((_, i) => [i])

    const parsed = JSON.parse(match[0]) as number[][]
    return normaliseClusterResult(parsed, tickets.length)
  } catch {
    return tickets.map((_, i) => [i])
  }
}

async function aiClusterLargePool(
  tickets: JiraTicket[],
  category: 'Bug' | 'Feedback',
  apiKey: string,
): Promise<number[][]> {
  // Step 1: cluster within batches of AI_BATCH_SIZE
  const batches: JiraTicket[][] = []
  for (let i = 0; i < tickets.length; i += AI_BATCH_SIZE) {
    batches.push(tickets.slice(i, i + AI_BATCH_SIZE))
  }

  const batchResults = await Promise.all(
    batches.map(batch => aiClusterSingle(batch, category, apiKey)),
  )

  // Map each within-batch group back to original indices and pick a representative
  type Cluster = { originalIndices: number[]; representative: JiraTicket }
  const clusters: Cluster[] = []
  batches.forEach((batch, batchIdx) => {
    const offset = batchIdx * AI_BATCH_SIZE
    for (const group of batchResults[batchIdx]) {
      clusters.push({
        originalIndices: group.map(i => offset + i),
        representative: batch[group[0]],
      })
    }
  })

  if (clusters.length <= 1) return clusters.map(c => c.originalIndices)

  // Step 2: merge clusters across batches by clustering their representatives
  const repTickets = clusters.map(c => c.representative)
  const mergeGroups = await aiClusterSingle(repTickets, category, apiKey)

  return mergeGroups.map(repIndices =>
    repIndices.flatMap(ri => clusters[ri].originalIndices),
  )
}

async function aiClusterPool(
  tickets: JiraTicket[],
  category: 'Bug' | 'Feedback',
  apiKey: string,
): Promise<number[][]> {
  if (tickets.length <= 1) return tickets.map((_, i) => [i])
  if (tickets.length > AI_BATCH_SIZE) return aiClusterLargePool(tickets, category, apiKey)
  return aiClusterSingle(tickets, category, apiKey)
}

// ─── Hook generation ─────────────────────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/#+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function generateHook(group: JiraTicket[]): string {
  const withDesc = group
    .filter(t => {
      const d = t.description?.trim() ?? ''
      return d.length > 40 && !/^(see |refer |attached|n\/a|none)/i.test(d)
    })
    .sort((a, b) => {
      const lenDiff = (b.description?.length ?? 0) - (a.description?.length ?? 0)
      return lenDiff !== 0 ? lenDiff : (b.impactScore ?? 0) - (a.impactScore ?? 0)
    })

  const bestDesc = withDesc[0]?.description?.trim()

  if (bestDesc) {
    const cleaned = cleanText(bestDesc)
    const sentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10)
    const excerpt = sentences.slice(0, 3).join(' ')
    if (excerpt.length > 220) return excerpt.substring(0, 217) + '...'
    if (excerpt.length > 0) return excerpt
  }

  const bestSummary = group
    .sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0))[0]
    .summary
  const cleaned = cleanText(bestSummary)
  return cleaned.length > 220 ? cleaned.substring(0, 217) + '...' : cleaned
}

// ─── Why Tag classification ───────────────────────────────────────────────────

function classifyWhyTag(
  tickets: JiraTicket[],
): 'Friction' | 'Wishlist' | 'Retention' | 'Revenue' {
  const combinedText = tickets
    .map(t => [t.summary, t.description ?? ''].join(' '))
    .join(' ')
    .toLowerCase()

  const scores: Record<string, number> = {
    Friction: 0,
    Delight: 0,
    Retention: 0,
    Revenue: 0,
  }

  for (const [tag, keywords] of Object.entries(WHY_TAG_KEYWORDS)) {
    for (const kw of keywords) {
      let idx = 0
      while ((idx = combinedText.indexOf(kw, idx)) !== -1) {
        scores[tag]++
        idx += kw.length
      }
    }
  }

  const best = (Object.keys(scores) as Array<keyof typeof scores>).reduce((a, b) =>
    scores[a] >= scores[b] ? a : b,
  )
  return (scores[best] > 0 ? best : 'Friction') as
    'Friction' | 'Wishlist' | 'Retention' | 'Revenue'
}

// ─── Temperature calculation ─────────────────────────────────────────────────

function normalise(values: number[]): number[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return values.map(() => 50)
  return values.map(v => ((v - min) / (max - min)) * 100)
}

function computeTemperatures(rawGroups: {
  frequency: number
  impactScore: number
  recencyDays: number
}[]): { temperatureScore: number; temperature: 'Hot' | 'Medium' | 'Cold' }[] {
  if (rawGroups.length === 0) return []
  if (rawGroups.length === 1) {
    return [{ temperatureScore: 50, temperature: 'Hot' }]
  }

  const freqNorm = normalise(rawGroups.map(g => g.frequency))
  const impactNorm = normalise(rawGroups.map(g => g.impactScore))
  const recencyNorm = normalise(rawGroups.map(g => -g.recencyDays))

  const scores = rawGroups.map((_, i) => {
    return freqNorm[i] * 0.4 + impactNorm[i] * 0.3 + recencyNorm[i] * 0.3
  })

  const sorted = [...scores].sort((a, b) => a - b)
  const p30 = sorted[Math.floor(sorted.length * 0.29)]
  const p70 = sorted[Math.floor(sorted.length * 0.69)]

  return scores.map(s => {
    let temperature: 'Hot' | 'Medium' | 'Cold'
    if (s > p70) temperature = 'Hot'
    else if (s > p30) temperature = 'Medium'
    else temperature = 'Cold'
    return { temperatureScore: Math.round(s), temperature }
  })
}

// ─── AI enrichment (titles + summaries) ──────────────────────────────────────

async function enrichBatch(
  batch: InsightGroup[],
  apiKey: string,
): Promise<InsightGroup[]> {
  const batchContent = batch.map((g, i) => {
    const lines = g.tickets.slice(0, 8).map(t => `- ${t.summary}`).join('\n')
    return `[${i + 1}] ${g.category} · ${g.teamName} · ${g.tickets.length} reports:\n${lines}`
  }).join('\n\n')

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
        max_tokens: 300 * batch.length,
        messages: [{
          role: 'user',
          content: `Analyze these ${batch.length} product feedback groups. For each group numbered [1]–[${batch.length}], generate a title (6-10 words, specific) and summary (2 sentences: what users experience + business impact).\n\n${batchContent}\n\nReturn a JSON array of exactly ${batch.length} objects:\n[{"title":"...","summary":"..."}, ...]`,
        }],
      }),
    })

    if (!resp.ok) return batch

    const data = await resp.json() as { content: { type: string; text: string }[] }
    const text = data.content?.[0]?.text ?? ''
    const match = text.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(match?.[0] ?? '[]') as { title?: string; summary?: string }[]

    return batch.map((g, i) => ({
      ...g,
      title: parsed[i]?.title?.trim() || g.title,
      aiSummary: parsed[i]?.summary?.trim() || g.aiSummary,
    }))
  } catch {
    return batch
  }
}

async function enrichWithAI(groups: InsightGroup[]): Promise<InsightGroup[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return groups

  const toEnrich = groups.slice(0, ENRICH_TOP_N)
  const rest = groups.slice(ENRICH_TOP_N)

  const batches: InsightGroup[][] = []
  for (let i = 0; i < toEnrich.length; i += ENRICH_BATCH_SIZE) {
    batches.push(toEnrich.slice(i, i + ENRICH_BATCH_SIZE))
  }

  const results = await Promise.all(batches.map(b => enrichBatch(b, apiKey)))
  return [...results.flat(), ...rest]
}

// ─── Pool clustering ──────────────────────────────────────────────────────────

async function clusterPool(
  tickets: JiraTicket[],
  category: 'Bug' | 'Feedback',
  apiKey: string,
): Promise<Omit<InsightGroup, 'temperatureScore' | 'temperature'>[]> {
  if (tickets.length === 0) return []

  const clusterIndices = await aiClusterPool(tickets, category, apiKey)

  const today = new Date()

  return clusterIndices.map(indices => {
    const groupTickets = indices.map(i => tickets[i])

    groupTickets.sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
    )
    const rep = groupTickets[0]

    const mostRecent = groupTickets.reduce((best, t) =>
      new Date(t.created) > new Date(best.created) ? t : best,
    )

    const sources = [
      ...new Set(groupTickets.flatMap(t => t.labels)),
    ].filter(Boolean)

    const impactScores = groupTickets
      .map(t => t.impactScore)
      .filter((s): s is number => s !== null)
    const avgImpact =
      impactScores.length > 0
        ? impactScores.reduce((a, b) => a + b, 0) / impactScores.length
        : 0

    const hook = generateHook(groupTickets)
    const whyTag = classifyWhyTag(groupTickets)

    void today

    return {
      id: rep.key,
      representativeTicket: rep,
      tickets: groupTickets,
      frequency: groupTickets.length,
      category,
      teamName: rep.teamName ?? '',
      featureName: rep.featureName ?? '',
      sources,
      impactScore: Math.round(avgImpact * 100) / 100,
      recency: mostRecent.created,
      temperature: 'Cold' as const,
      temperatureScore: 0,
      hook,
      title: rep.summary ?? '',
      aiSummary: '',
      whyTag,
    }
  })
}

// ─── Main clustering function ─────────────────────────────────────────────────

const clusterCache = new Map<string, InsightGroup[]>()

export async function clusterTickets(
  tickets: JiraTicket[],
  aiProvider: string = 'none',
): Promise<InsightGroup[]> {
  const cacheKey = `${tickets.length}:${aiProvider}`
  if (clusterCache.has(cacheKey)) return clusterCache.get(cacheKey)!

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[clustering] No ANTHROPIC_API_KEY — returning ungrouped tickets')
    return tickets.map(t => ({
      id: t.key,
      representativeTicket: t,
      tickets: [t],
      frequency: 1,
      category: (t.category as 'Bug' | 'Feedback') ?? 'Feedback',
      teamName: t.teamName ?? '',
      featureName: t.featureName ?? '',
      sources: t.labels ?? [],
      impactScore: t.impactScore ?? 0,
      recency: t.created,
      temperature: 'Cold' as const,
      temperatureScore: 0,
      hook: t.summary,
      title: t.summary,
      aiSummary: '',
      whyTag: 'Friction' as const,
    }))
  }

  const teamNames = [...new Set(tickets.map(t => t.teamName ?? ''))]

  type PoolFn = () => Promise<Omit<InsightGroup, 'temperatureScore' | 'temperature'>[]>
  const tasks: PoolFn[] = teamNames.flatMap(team => {
    const teamTickets = tickets.filter(t => (t.teamName ?? '') === team)
    const bugs = teamTickets.filter(t => t.category === 'Bug')
    const feedback = teamTickets.filter(t => t.category === 'Feedback')
    const uncategorised = teamTickets.filter(
      t => t.category !== 'Bug' && t.category !== 'Feedback',
    )
    return [
      () => clusterPool(bugs, 'Bug', apiKey),
      () => clusterPool(feedback, 'Feedback', apiKey),
      () => clusterPool(uncategorised, 'Feedback', apiKey),
    ]
  })

  const CONCURRENCY = 8
  const poolResults: Omit<InsightGroup, 'temperatureScore' | 'temperature'>[][] = []
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(fn => fn()))
    poolResults.push(...results)
  }

  const allGroups = poolResults.flat()

  const now = Date.now()
  const rawTemps = allGroups.map(g => ({
    frequency: g.frequency,
    impactScore: g.impactScore,
    recencyDays: (now - new Date(g.recency).getTime()) / (1000 * 60 * 60 * 24),
  }))

  const temps = computeTemperatures(rawTemps)

  const result: InsightGroup[] = allGroups.map((g, i) => ({
    ...g,
    temperatureScore: temps[i].temperatureScore,
    temperature: temps[i].temperature,
  }))

  result.sort((a, b) => b.temperatureScore - a.temperatureScore)

  const finalResult = await enrichWithAI(result)

  clusterCache.set(cacheKey, finalResult)
  return finalResult
}
