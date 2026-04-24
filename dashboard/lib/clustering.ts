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

async function aiClusterGlobal(
  tickets: JiraTicket[],
  category: 'Bug' | 'Feedback',
  apiKey: string,
): Promise<number[][]> {
  if (tickets.length === 0) return []
  if (tickets.length === 1) return [[0]]

  const lines = tickets
    .map((t, i) => {
      const desc = t.description?.trim().slice(0, 200) ?? ''
      return `[${i}] ${t.summary}${desc ? `\n    ${desc}` : ''}`
    })
    .join('\n')

  try {
    const raw = await callGemini(
      apiKey,
      `You are grouping product ${category === 'Bug' ? 'bug reports' : 'feedback'} for a PM dashboard.

Read each ticket's title AND the description below it. Understand the specific problem each user is experiencing before grouping.

Group tickets that describe the EXACT SAME specific user problem — i.e. different users hitting the same issue or making the same request.

RULES:
1. Read descriptions carefully. Titles alone can be misleading.
2. Group by the SPECIFIC problem, not the general area:
   - "Streak resets after one missed day" + "Lost 90-day streak due to system outage" → same problem (streak lost unfairly) → ONE group
   - "Can't jump to a specific lesson video" + "Can't find which quests are incomplete" → different problems → SEPARATE groups
   - "App crashes on launch" + "App freezes mid-video" → different failure modes → SEPARATE groups
3. Do NOT group tickets just because they share a keyword (e.g. "navigation", "loading", "discovery").
4. Different user goals = different groups, even if they sound related.

${lines}

Output ONLY a JSON array of arrays of 0-based indices. Every index 0-${tickets.length - 1} must appear exactly once.
Example: [[0,3],[1],[2,4,5],[6,7],[8]]`,
      8192,
    )

    const text = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) {
      console.error('[cluster] Could not parse global response — TF-IDF fallback:', raw.slice(0, 200))
      return tfidfFallback(tickets)
    }

    const parsed = JSON.parse(match[0]) as number[][]
    return normaliseClusterResult(parsed, tickets.length)
  } catch (err) {
    console.error('[cluster] Global cluster exception — TF-IDF fallback:', err)
    return tfidfFallback(tickets)
  }
}

// ─── Hook generation ─────────────────────────────────────────────────────────

const TITLE_CASE_MINORS = new Set([
  'a','an','the','and','but','or','for','nor','on','at','to','by','in','of','up','as','with','from',
])

function toTitleCase(str: string): string {
  return str
    .split(' ')
    .map((word, i) => {
      if (!word) return word
      if (i === 0 || !TITLE_CASE_MINORS.has(word.toLowerCase())) {
        // Preserve already-correct casing for acronyms/proper nouns (iOS, iPad, AI)
        if (word === word.toUpperCase() && word.length > 1) return word
        return word.charAt(0).toUpperCase() + word.slice(1)
      }
      return word.toLowerCase()
    })
    .join(' ')
}

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
  const recencyNorm = normalise(rawGroups.map(g => -g.recencyDays))
  const scores = rawGroups.map((_, i) => freqNorm[i] * 0.7 + recencyNorm[i] * 0.3)

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
- title: 6-10 words in Title Case (capitalise every word except articles/prepositions), clear and specific (e.g. "Streak Counter Resets After Completing Daily Activities")
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
      title: toTitleCase(parsed[i]?.title?.trim() || g.title),
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
  // Sequential — parallel calls trigger rate limiting and silently return empty aiSummary
  const enriched: InsightGroup[] = []
  for (const batch of batches) {
    const result = await enrichBatch(batch, apiKey)
    enriched.push(...result)
  }
  return enriched
}

// ─── Build groups from cluster indices ───────────────────────────────────────

function buildGroups(
  tickets: JiraTicket[],
  indices: number[][],
  category: 'Bug' | 'Feedback',
): Omit<InsightGroup, 'temperatureScore' | 'temperature'>[] {
  return indices.map((idxArr: number[]) => {
    const groupTickets = idxArr.map((i: number) => tickets[i])
    const rep = [...groupTickets].sort((a: JiraTicket, b: JiraTicket) => (b.impactScore ?? 0) - (a.impactScore ?? 0))[0]

    const featureCount = new Map<string, number>()
    for (const t of groupTickets) featureCount.set(t.featureName ?? '', (featureCount.get(t.featureName ?? '') ?? 0) + 1)
    const dominantFeature = [...featureCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

    const mostRecent = groupTickets.reduce((best: JiraTicket, t: JiraTicket) =>
      new Date(t.updated ?? t.created) > new Date(best.updated ?? best.created) ? t : best,
    )
    const sources = [...new Set(groupTickets.flatMap((t: JiraTicket) => t.labels))].filter(Boolean)
    const impactScores = groupTickets.map((t: JiraTicket) => t.impactScore).filter((s: unknown): s is number => typeof s === 'number')
    const avgImpact = impactScores.length > 0 ? impactScores.reduce((a: number, b: number) => a + b, 0) / impactScores.length : 0

    return {
      id: rep.key,
      representativeTicket: rep,
      tickets: groupTickets,
      frequency: groupTickets.length,
      category,
      teamName: rep.teamName ?? '',
      featureName: dominantFeature,
      sources,
      impactScore: Math.round(avgImpact * 100) / 100,
      recency: mostRecent.updated ?? mostRecent.created,
      temperature: 'Cold' as const,
      temperatureScore: 0,
      hook: generateHook(groupTickets),
      title: toTitleCase(rep.summary ?? ''),
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
  if (!apiKey) console.warn('[clustering] No GEMINI_API_KEY — grouping by TF-IDF only')

  // Pool by team (strict) → category only. Never split by feature — tickets about the
  // same user problem are often tagged to different features (e.g. "streak reset" can be
  // tagged "Meditations" or "Streaks & Progress" depending on who filed it). Splitting by
  // feature puts those tickets in separate pools where they can never be grouped together.
  // The dominant featureName of each resulting group is shown on the card.
  type TicketPool = { tickets: JiraTicket[]; category: 'Bug' | 'Feedback' }
  const pools: TicketPool[] = []

  const teams = [...new Set(tickets.map(t => t.teamName ?? ''))]
  for (const team of teams) {
    const teamTickets = tickets.filter(t => (t.teamName ?? '') === team)
    const bugs = teamTickets.filter(t => t.category === 'Bug')
    const feedback = teamTickets.filter(t => t.category === 'Feedback')
    const other = teamTickets.filter(t => t.category !== 'Bug' && t.category !== 'Feedback')
    if (bugs.length > 0) pools.push({ tickets: bugs, category: 'Bug' })
    if (feedback.length > 0) pools.push({ tickets: feedback, category: 'Feedback' })
    if (other.length > 0) pools.push({ tickets: other, category: 'Feedback' })
  }

  const CONCURRENCY = 8
  const rawGroups: Omit<InsightGroup, 'temperatureScore' | 'temperature'>[] = []
  for (let i = 0; i < pools.length; i += CONCURRENCY) {
    const batch = pools.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(({ tickets: pool, category }) => {
        if (!apiKey) return Promise.resolve(buildGroups(pool, pool.map((_: JiraTicket, idx: number) => [idx]), category))
        return aiClusterGlobal(pool, category, apiKey).then(indices => buildGroups(pool, indices, category))
      }),
    )
    rawGroups.push(...results.flat())
  }

  const allGroups = rawGroups
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

