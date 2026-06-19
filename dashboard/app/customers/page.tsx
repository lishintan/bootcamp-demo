export const dynamic = 'force-dynamic'

import staticCustomerSessions from '@/data/customer-sessions.json'
import CustomersClient from './CustomersClient'

interface CustomerRecord {
  segment: string
  summary: string
}

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

export default function CustomersPage() {
  const records = staticCustomerSessions as CustomerRecord[]

  const counts: Record<string, number> = {}
  for (const r of records) {
    const id = classifyArchetype(r.segment, r.summary)
    counts[id] = (counts[id] || 0) + 1
  }

  return <CustomersClient counts={counts} totalCustomers={records.length} />
}
