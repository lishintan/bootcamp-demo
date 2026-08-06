export const dynamic = 'force-dynamic'

import { fetchCustomerResearch } from '@/lib/airtable'
import CustomersClient from './CustomersClient'

/**
 * Assigns each interviewed customer to exactly one archetype. Deterministic and
 * total — segment-based rules for the clear groups, plus a parent-vs-seeker
 * keyword split for the large "Weekly Active" core. Keep ids in sync with
 * PERSONAS in CustomersClient.tsx.
 */
function classifyArchetype(segment: string, summary: string): string {
  const s = (segment || '').toLowerCase()
  const sum = (summary || '').toLowerCase()
  if (s.includes('referral') || s.includes('free') || s.includes('viewed sales page')) return 'explorers'
  if (s.includes('refund') || s.includes('churn') || s.includes('did not consume') || s.includes('reset password')) return 'drifters'
  if (s.includes('[premium]') || s.includes('completed program') || s.includes('lifebook') || sum.includes('mastery') || sum.includes('certification')) return 'devotees'
  if (s.includes('eve ai')) return 'makers'
  if (/\b(parent|mom|mum|dad|mother|father|kids|children|son|daughter|family|raising)\b/.test(sum)) return 'parents'
  return 'seekers'
}

/**
 * Records reach us in one of two shapes and we must handle both:
 *   • Live Airtable  → { id, fields: { Segment, Summary, ... } }
 *   • Static snapshot → { id, segment, summary, ... }  (data/customer-sessions.json)
 * We pull `segment`/`summary` out of whichever shape we're given, matching field
 * names case-insensitively (exact match preferred) so live column labels like
 * "Segment"/"Summary" work without hardcoding their exact casing.
 */
function extractSegmentSummary(record: unknown): { segment: string; summary: string } {
  const r = (record ?? {}) as Record<string, unknown>
  const fields = (r.fields && typeof r.fields === 'object' ? r.fields : r) as Record<string, unknown>

  const pick = (key: string): string => {
    // top-level (snapshot) value wins if present
    if (typeof r[key] === 'string') return r[key] as string
    const entries = Object.entries(fields)
    const exact = entries.find(([k, v]) => typeof v === 'string' && k.toLowerCase() === key)
    if (exact) return exact[1] as string
    const partial = entries.find(([k, v]) => typeof v === 'string' && k.toLowerCase().includes(key))
    return partial ? (partial[1] as string) : ''
  }

  return { segment: pick('segment'), summary: pick('summary') }
}

export default async function CustomersPage() {
  const { records } = await fetchCustomerResearch()

  const counts: Record<string, number> = {}
  for (const record of records) {
    const { segment, summary } = extractSegmentSummary(record)
    const id = classifyArchetype(segment, summary)
    counts[id] = (counts[id] || 0) + 1
  }

  return <CustomersClient counts={counts} totalCustomers={records.length} />
}
