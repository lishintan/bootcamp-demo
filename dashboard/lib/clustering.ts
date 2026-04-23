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

const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare',
  'ought', 'used', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'she', 'it', 'they', 'them', 'their', 'this', 'that', 'these', 'those',
  'as', 'if', 'so', 'than', 'then', 'when', 'where', 'who', 'which',
  'not', 'no', 'nor', 'all', 'any', 'some', 'such', 'more', 'most',
  'other', 'into', 'about', 'up', 'out', 'also', 'just', 'its', 'how',
  'what', 'there', 'here', 'get', 'set', 'new', 'use', 'via', 'per',
])

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

// ─── Text processing ─────────────────────────────────────────────────────────

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !ENGLISH_STOPWORDS.has(t))
}

function buildCorpus(ticket: JiraTicket): string {
  const parts: string[] = [ticket.summary]
  if (ticket.description) parts.push(ticket.description)
  if (ticket.featureName) parts.push(ticket.featureName)
  if (ticket.featureTitle) parts.push(ticket.featureTitle)
  return parts.join(' ')
}

// ─── TF-IDF ──────────────────────────────────────────────────────────────────

function computeTfIdf(docs: string[][]): number[][] {
  const N = docs.length
  // DF: how many docs contain each term
  const df = new Map<string, number>()
  for (const doc of docs) {
    const unique = new Set(doc)
    for (const term of unique) {
      df.set(term, (df.get(term) ?? 0) + 1)
    }
  }

  // IDF with smoothing
  const idf = new Map<string, number>()
  for (const [term, count] of df) {
    idf.set(term, Math.log((N + 1) / (count + 1)) + 1)
  }

  // Build vocabulary (only terms that appear in at least 2 docs, for speed)
  const vocab: string[] = []
  for (const [term, count] of df) {
    if (count >= 2) vocab.push(term)
  }

  // TF-IDF vectors
  const vectors: number[][] = docs.map(doc => {
    const tf = new Map<string, number>()
    for (const term of doc) {
      tf.set(term, (tf.get(term) ?? 0) + 1)
    }
    const docLen = doc.length || 1

    return vocab.map(term => {
      const termTf = (tf.get(term) ?? 0) / docLen
      const termIdf = idf.get(term) ?? 0
      return termTf * termIdf
    })
  })

  return vectors
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ─── Single-linkage clustering ────────────────────────────────────────────────

function singleLinkageClusters(
  tickets: JiraTicket[],
  vectors: number[][],
  threshold: number,
): number[][] {
  const n = tickets.length
  // Union-Find
  const parent = Array.from({ length: n }, (_, i) => i)

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }

  function union(x: number, y: number) {
    const px = find(x)
    const py = find(y)
    if (px !== py) parent[px] = py
  }

  // O(n²) similarity check — batched for performance
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) !== find(j)) {
        const sim = cosineSimilarity(vectors[i], vectors[j])
        if (sim >= threshold) {
          union(i, j)
        }
      }
    }
  }

  // Group indices by root
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(i)
  }

  return Array.from(groups.values())
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
  // Pick the ticket with the richest description (prefer higher impact score as tiebreak)
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
    // Take up to 3 sentences for meaningful context
    const sentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10)
    const excerpt = sentences.slice(0, 3).join(' ')
    if (excerpt.length > 220) return excerpt.substring(0, 217) + '...'
    if (excerpt.length > 0) return excerpt
  }

  // Fallback: use the best summary from the group
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
  // Recency: fewer days since = higher score. Invert by normalising negated days.
  const recencyNorm = normalise(rawGroups.map(g => -g.recencyDays))

  const scores = rawGroups.map((_, i) => {
    return freqNorm[i] * 0.4 + impactNorm[i] * 0.3 + recencyNorm[i] * 0.3
  })

  // Sort indices by score to compute percentile-based tiers
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

// ─── AI enrichment ────────────────────────────────────────────────────────────

async function enrichWithAI(groups: InsightGroup[]): Promise<InsightGroup[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return groups

  const enriched = await Promise.all(groups.map(async (group) => {
    try {
      const ticketLines = group.tickets
        .slice(0, 15)
        .map(t => `- ${t.summary}`)
        .join('\n')

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `You analyze product feedback for a product intelligence dashboard. Team: ${group.teamName}. Category: ${group.category}. ${group.tickets.length} user reports:\n${ticketLines}\n\nGenerate:\n1. Title: 6-10 word headline naming the specific problem (not generic)\n2. Summary: 2 sentences. Sentence 1: what users are experiencing. Sentence 2: the business/user impact.\n\nJSON only: {"title": "...", "summary": "..."}`,
          }],
        }),
      })

      if (!resp.ok) return group

      const data = await resp.json() as { content: { type: string; text: string }[] }
      const text = data.content?.[0]?.text ?? ''
      const match = text.match(/\{[\s\S]*?\}/)
      const parsed = JSON.parse(match?.[0] ?? '{}') as { title?: string; summary?: string }

      return {
        ...group,
        title: parsed.title?.trim() || group.title,
        aiSummary: parsed.summary?.trim() || group.aiSummary,
      }
    } catch {
      return group
    }
  }))

  return enriched
}

// ─── Main clustering function ─────────────────────────────────────────────────

const clusterCache = new Map<string, InsightGroup[]>()

export async function clusterTickets(
  tickets: JiraTicket[],
  aiProvider: string = 'none',
): Promise<InsightGroup[]> {
  // Cache key: count + category breakdown (cheap hash)
  const cacheKey = `${tickets.length}:${aiProvider}`
  if (clusterCache.has(cacheKey)) return clusterCache.get(cacheKey)!

  const threshold = aiProvider === 'none' ? 0.45 : 0.80

  // Cluster within each team independently — prevents cross-team contamination
  const teamNames = [...new Set(tickets.map(t => t.teamName ?? ''))]

  const allGroups = teamNames.flatMap(team => {
    const teamTickets = tickets.filter(t => (t.teamName ?? '') === team)
    const bugs = teamTickets.filter(t => t.category === 'Bug')
    const feedback = teamTickets.filter(t => t.category === 'Feedback')
    const uncategorised = teamTickets.filter(
      t => t.category !== 'Bug' && t.category !== 'Feedback',
    )
    return [
      ...clusterPool(bugs, 'Bug', threshold),
      ...clusterPool(feedback, 'Feedback', threshold),
      ...clusterPool(uncategorised, 'Feedback', threshold),
    ]
  })

  // Compute temperatures across all groups
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

  // Sort by temperatureScore descending
  result.sort((a, b) => b.temperatureScore - a.temperatureScore)

  const finalResult = aiProvider !== 'none'
    ? await enrichWithAI(result)
    : result

  clusterCache.set(cacheKey, finalResult)
  return finalResult
}

function clusterPool(
  tickets: JiraTicket[],
  category: 'Bug' | 'Feedback',
  threshold: number,
): Omit<InsightGroup, 'temperatureScore' | 'temperature'>[] {
  if (tickets.length === 0) return []

  // Build token docs
  const docs = tickets.map(t => tokenise(buildCorpus(t)))

  // TF-IDF vectors
  const vectors = computeTfIdf(docs)

  // Single-linkage clustering
  const clusterIndices = singleLinkageClusters(tickets, vectors, threshold)

  const today = new Date()

  return clusterIndices.map(indices => {
    const groupTickets = indices.map(i => tickets[i])

    // Sort by created ascending — earliest is representative
    groupTickets.sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
    )
    const rep = groupTickets[0]

    // Recency: most recently created ticket
    const mostRecent = groupTickets.reduce((best, t) =>
      new Date(t.created) > new Date(best.created) ? t : best,
    )

    // Sources: unique labels across all tickets
    const sources = [
      ...new Set(groupTickets.flatMap(t => t.labels)),
    ].filter(Boolean)

    // Average impact score (skip nulls)
    const impactScores = groupTickets
      .map(t => t.impactScore)
      .filter((s): s is number => s !== null)
    const avgImpact =
      impactScores.length > 0
        ? impactScores.reduce((a, b) => a + b, 0) / impactScores.length
        : 0

    const hook = generateHook(groupTickets)
    const whyTag = classifyWhyTag(groupTickets)

    void today // suppress unused-variable lint

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
      // temperature filled in after global scoring pass
      temperature: 'Cold' as const,
      temperatureScore: 0,
      hook,
      title: rep.summary ?? '',
      aiSummary: '',
      whyTag,
    }
  })
}
