import type { JiraTicket } from './jira'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InsightGroup {
  id: string
  representativeTicket: JiraTicket
  tickets: JiraTicket[]
  frequency: number
  category: 'Bug' | 'Feedback'
  teamName: string
  featureName: string
  sources: string[]
  impactScore: number
  recency: string
  temperature: 'Hot' | 'Medium' | 'Cold'
  temperatureScore: number
  hook: string
  title: string
  aiSummary: string
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

const ENRICH_BATCH_SIZE = 10

// ─── TF-IDF (silent fallback when AI call fails) ──────────────────────────────

function tokenise(text: string): string[] {
  const stopwords = new Set([
    'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
    'from','is','are','was','were','be','been','have','has','had','do','does',
    'did','will','would','could','should','not','no','this','that','it','its',
  ])
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !stopwords.has(t))
}

function tfidfFallback(tickets: JiraTicket[], threshold = 0.25): number[][] {
  const docs = tickets.map(t =>
    tokenise([t.summary, t.description?.slice(0, 200) ?? '', t.featureName ?? ''].join(' ')),
  )
  const N = docs.length
  const df = new Map<string, number>()
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const vocab = [...df.keys()]
  const idf = new Map(vocab.map(t => [t, Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1]))

  const vectors = docs.map(doc => {
    const tf = new Map<string, number>()
    for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1)
    const len = doc.length || 1
    return vocab.map(t => ((tf.get(t) ?? 0) / len) * (idf.get(t) ?? 0))
  })

  const cosine = (a: number[], b: number[]) => {
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i] }
    return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
  }

  const parent = Array.from({ length: N }, (_, i) => i)
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  const union = (x: number, y: number) => { const px = find(x), py = find(y); if (px !== py) parent[px] = py }

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (find(i) !== find(j) && cosine(vectors[i], vectors[j]) >= threshold) union(i, j)
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < N; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(i)
  }
  return [...groups.values()]
}

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

async function callGemini(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    },
  )
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Gemini ${resp.status}: ${err.slice(0, 200)}`)
  }
  const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function aiClusterPool(
  tickets: JiraTicket[],
  category: 'Bug' | 'Feedback',
  apiKey: string,
): Promise<number[][]> {
  if (tickets.length <= 1) return tickets.map((_, i) => [i])

  const lines = tickets
    .map((t, i) => {
      const desc = t.description?.trim().slice(0, 500) ?? ''
      return `[${i}] ${t.summary}${desc ? ' — ' + desc : ''}`
    })
    .join('\n')

  try {
    const raw = await callGemini(
      apiKey,
      `Group these ${tickets.length} ${category === 'Bug' ? 'bug' : 'feedback'} tickets by the specific user-facing problem they describe.

RULES:
1. Only group tickets that describe the SAME broken feature OR the SAME specific request — not just tickets that share a keyword.
2. The ROOT PROBLEM must match: "streak counter not updating" and "video freezing mid-lesson" are DIFFERENT problems even if both happen during a meditation session.
3. "Streak not credited after session" + "streak resets unexpectedly" + "sessions not counting toward streak" → same group (streak tracking broken).
4. "App freezes during lesson" + "video won't load" → same group (playback broken). But these must NOT merge with streak issues.
5. When in doubt, keep separate. A missed grouping is better than a wrong one.

${lines}

Output ONLY a JSON array of arrays of indices. No explanation, no markdown.
Example: [[0,3],[1,4],[2],[5,6]]`,
      Math.min(tickets.length * 40 + 1000, 8192),
    )

    const text = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) {
      console.error('[cluster] Could not parse Gemini response — falling back to TF-IDF. Response:', raw.slice(0, 200))
      return tfidfFallback(tickets)
    }

    const parsed = JSON.parse(match[0]) as number[][]
    return normaliseClusterResult(parsed, tickets.length)
  } catch (err) {
    console.error('[cluster] Exception — falling back to TF-IDF:', err)
    return tfidfFallback(tickets)
  }
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
    const sentences = cleaned.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 10)
    const excerpt = sentences.slice(0, 3).join(' ')
    if (excerpt.length > 220) return excerpt.substring(0, 217) + '...'
    if (excerpt.length > 0) return excerpt
  }

  const best = group.sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0))[0].summary
  const cleaned = cleanText(best)
  return cleaned.length > 220 ? cleaned.substring(0, 217) + '...' : cleaned
}

// ─── Why Tag classification ───────────────────────────────────────────────────

function classifyWhyTag(tickets: JiraTicket[]): 'Friction' | 'Wishlist' | 'Retention' | 'Revenue' {
  const text = tickets.map(t => [t.summary, t.description ?? ''].join(' ')).join(' ').toLowerCase()
  const scores: Record<string, number> = { Friction: 0, Wishlist: 0, Retention: 0, Revenue: 0 }
  for (const [tag, keywords] of Object.entries(WHY_TAG_KEYWORDS)) {
    for (const kw of keywords) {
      let idx = 0
      while ((idx = text.indexOf(kw, idx)) !== -1) { scores[tag]++; idx += kw.length }
    }
  }
  const best = (Object.keys(scores) as Array<keyof typeof scores>).reduce((a, b) => scores[a] >= scores[b] ? a : b)
  return (scores[best] > 0 ? best : 'Friction') as 'Friction' | 'Wishlist' | 'Retention' | 'Revenue'
}

// ─── Temperature calculation ─────────────────────────────────────────────────

function normalise(values: number[]): number[] {
  const min = Math.min(...values), max = Math.max(...values)
  if (max === min) return values.map(() => 50)
  return values.map(v => ((v - min) / (max - min)) * 100)
}

function computeTemperatures(rawGroups: { frequency: number; impactScore: number; recencyDays: number }[]) {
  if (rawGroups.length === 0) return []
  if (rawGroups.length === 1) return [{ temperatureScore: 50, temperature: 'Hot' as const }]

  const freqNorm = normalise(rawGroups.map(g => g.frequency))
  const impactNorm = normalise(rawGroups.map(g => g.impactScore))
  const recencyNorm = normalise(rawGroups.map(g => -g.recencyDays))
  const scores = rawGroups.map((_, i) => freqNorm[i] * 0.4 + impactNorm[i] * 0.3 + recencyNorm[i] * 0.3)

  const sorted = [...scores].sort((a, b) => a - b)
  const p30 = sorted[Math.floor(sorted.length * 0.29)]
  const p70 = sorted[Math.floor(sorted.length * 0.69)]

  return scores.map(s => ({
    temperatureScore: Math.round(s),
    temperature: (s > p70 ? 'Hot' : s > p30 ? 'Medium' : 'Cold') as 'Hot' | 'Medium' | 'Cold',
  }))
}

// ─── AI enrichment (titles + summaries) ──────────────────────────────────────

async function enrichBatch(batch: InsightGroup[], apiKey: string): Promise<InsightGroup[]> {
  const batchContent = batch.map((g, i) => {
    const lines = g.tickets.slice(0, 5).map(t => {
      const desc = t.description?.trim().slice(0, 300) ?? ''
      return `  - ${t.summary}${desc ? `\n    "${desc}"` : ''}`
    }).join('\n')
    return `[${i + 1}] ${g.featureName} · ${g.category} · ${g.tickets.length} reports:\n${lines}`
  }).join('\n\n')

  try {
    const text = await callGemini(
      apiKey,
      `You are a product analyst writing insight cards for a PM dashboard. For each of the ${batch.length} groups below, write:
- title: 6-10 words, clear and specific (e.g. "Streak counter resets after completing daily activities")
- summary: 2 sentences. First: what users are experiencing (use the actual feedback). Second: why this matters to the business.

${batchContent}

Return a JSON array of exactly ${batch.length} objects:
[{"title":"...","summary":"..."}, ...]`,
      Math.min(250 * batch.length, 3000),
    )

    const match = text.match(/\[[\s\S]*\]/)
    if (!match) {
      console.error('[enrich] No JSON array in response:', text.slice(0, 300))
      return batch
    }
    const parsed = JSON.parse(match[0]) as { title?: string; summary?: string }[]
    return batch.map((g, i) => ({
      ...g,
      title: parsed[i]?.title?.trim() || g.title,
      aiSummary: parsed[i]?.summary?.trim() || g.aiSummary,
    }))
  } catch (err) {
    console.error('[enrich] Exception:', err)
    return batch
  }
}

async function enrichWithAI(groups: InsightGroup[]): Promise<InsightGroup[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return groups
  const batches: InsightGroup[][] = []
  for (let i = 0; i < groups.length; i += ENRICH_BATCH_SIZE) batches.push(groups.slice(i, i + ENRICH_BATCH_SIZE))
  const results = await Promise.all(batches.map(b => enrichBatch(b, apiKey)))
  return results.flat()
}

// ─── Pool clustering ──────────────────────────────────────────────────────────

async function clusterPool(
  tickets: JiraTicket[],
  category: 'Bug' | 'Feedback',
  apiKey: string,
): Promise<Omit<InsightGroup, 'temperatureScore' | 'temperature'>[]> {
  if (tickets.length === 0) return []

  const clusterIndices = await aiClusterPool(tickets, category, apiKey)

  return clusterIndices.map(indices => {
    const groupTickets = indices.map(i => tickets[i])
    groupTickets.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
    const rep = groupTickets[0]
    const mostRecent = groupTickets.reduce((best, t) =>
      new Date(t.created) > new Date(best.created) ? t : best,
    )
    const sources = [...new Set(groupTickets.flatMap(t => t.labels))].filter(Boolean)
    const impactScores = groupTickets.map(t => t.impactScore).filter((s): s is number => s !== null)
    const avgImpact = impactScores.length > 0 ? impactScores.reduce((a, b) => a + b, 0) / impactScores.length : 0

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
      hook: generateHook(groupTickets),
      title: rep.summary ?? '',
      aiSummary: '',
      whyTag: classifyWhyTag(groupTickets),
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

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[clustering] No GEMINI_API_KEY — grouping by TF-IDF only')
    // Fall through: aiClusterPool will use tfidfFallback internally when apiKey is missing
  }

  const teamNames = [...new Set(tickets.map(t => t.teamName ?? ''))]

  type PoolFn = () => Promise<Omit<InsightGroup, 'temperatureScore' | 'temperature'>[]>
  const tasks: PoolFn[] = teamNames.flatMap(team => {
    // Pool by team + category only — NOT by feature.
    // Feature tags are inconsistent: "streak broken during meditation" can be tagged as
    // "Meditations" or "Streaks & Progress" depending on who filed it. Splitting by feature
    // puts those tickets in separate pools that never see each other and can never be grouped.
    const teamTickets = tickets.filter(t => (t.teamName ?? '') === team)
    const bugs = teamTickets.filter(t => t.category === 'Bug')
    const feedback = teamTickets.filter(t => t.category === 'Feedback')
    const uncategorised = teamTickets.filter(t => t.category !== 'Bug' && t.category !== 'Feedback')
    const key = apiKey ?? ''
    return [
      () => key ? clusterPool(bugs, 'Bug', key) : Promise.resolve(bugs.map(ticketToSingleton)),
      () => key ? clusterPool(feedback, 'Feedback', key) : Promise.resolve(feedback.map(ticketToSingleton)),
      () => key ? clusterPool(uncategorised, 'Feedback', key) : Promise.resolve(uncategorised.map(ticketToSingleton)),
    ]
  })

  const CONCURRENCY = 8
  const poolResults: Omit<InsightGroup, 'temperatureScore' | 'temperature'>[][] = []
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const results = await Promise.all(tasks.slice(i, i + CONCURRENCY).map(fn => fn()))
    poolResults.push(...results)
  }

  const allGroups = poolResults.flat()
  const now = Date.now()
  const temps = computeTemperatures(allGroups.map(g => ({
    frequency: g.frequency,
    impactScore: g.impactScore,
    recencyDays: (now - new Date(g.recency).getTime()) / (1000 * 60 * 60 * 24),
  })))

  const result: InsightGroup[] = allGroups.map((g, i) => ({
    ...g,
    temperatureScore: temps[i].temperatureScore,
    temperature: temps[i].temperature,
  }))

  result.sort((a, b) => b.temperatureScore - a.temperatureScore)

  const finalResult = apiKey ? await enrichWithAI(result) : result
  clusterCache.set(cacheKey, finalResult)
  return finalResult
}

function ticketToSingleton(t: JiraTicket): Omit<InsightGroup, 'temperatureScore' | 'temperature'> {
  return {
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
    hook: t.summary,
    title: t.summary,
    aiSummary: '',
    whyTag: 'Friction',
  }
}
