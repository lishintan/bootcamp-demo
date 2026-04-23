'use client'

import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerSession {
  id: string
  customerName: string
  segment: string
  location: {
    id?: string
    name: string
    color?: string
  }
  sessionStatus: string
  summary: string
}

type SegmentKey = 'membership' | 'premium'

// ─── Segment classification ────────────────────────────────────────────────────

/**
 * "Premium Programs" (Academy): explicit [Premium] tag OR summary mentions a Mastery/Certification course
 * "Mindvalley Membership": all others — including Quest-only, Refunded, Free, Churned, EVE AI
 */
function classifySegment(segment: string, summary: string): SegmentKey {
  if (segment.includes('[Premium]')) return 'premium'
  const s = summary.toLowerCase()
  if (s.includes('mastery') || s.includes('certification')) return 'premium'
  return 'membership'
}

// ─── Attribute extraction ──────────────────────────────────────────────────────

function extractAge(summary: string): string {
  const s = summary.toLowerCase()
  if (s.includes('20s')) return '20s'
  if (s.includes('30s')) return '30s'
  if (s.includes('40s')) return '40s'
  if (s.includes('50s')) return '50s'
  if (s.includes('60s')) return '60s'
  // Also check for explicit age mentions like "59-year-old", "71-year-old"
  const ageMatch = summary.match(/\b(\d{2})-year-old\b/)
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10)
    if (age >= 20 && age < 30) return '20s'
    if (age >= 30 && age < 40) return '30s'
    if (age >= 40 && age < 50) return '40s'
    if (age >= 50 && age < 60) return '50s'
    if (age >= 60 && age < 70) return '60s'
    if (age >= 70) return '70s+'
  }
  return 'Unknown'
}

function extractLifeStage(summary: string): string {
  const s = summary.toLowerCase()
  if (s.includes('parent') || s.includes(' mom ') || s.includes(' dad ') ||
      s.includes('mother') || s.includes('father') || s.includes(' kids') ||
      s.includes('children')) return 'Parent'
  if (s.includes('student') || s.includes('college') || s.includes('university')) return 'Student'
  if (s.includes('retired') || s.includes('retirement')) return 'Retired'
  if (s.includes(' single ')) return 'Single'
  if (s.includes('entrepreneur') || s.includes('business owner') || s.includes('freelance')) return 'Entrepreneur'
  return 'Professional'
}

function extractJobProfession(summary: string): string {
  const s = summary.toLowerCase()
  if (s.includes('coach') || s.includes('coaching')) return 'Coach'
  if (s.includes('entrepreneur') || s.includes('business owner') || s.includes('startup')) return 'Entrepreneur'
  if (s.includes('teacher') || s.includes('educator')) return 'Educator'
  if (s.includes('doctor') || s.includes('physician') || s.includes('therapist') || s.includes('nurse')) return 'Healthcare'
  if (s.includes('engineer') || s.includes('developer') || s.includes('software')) return 'Tech'
  if (s.includes('manager') || s.includes('executive') || s.includes('corporate')) return 'Corporate'
  if (s.includes('creative') || s.includes('artist') || s.includes('designer')) return 'Creative'
  return 'Other'
}

function extractMotivation(summary: string): string {
  const s = summary.toLowerCase()
  if (s.includes('personal growth') || s.includes('self-improvement') || s.includes('develop')) return 'Personal Growth'
  if (s.includes('wellness') || s.includes('health') || s.includes('fitness') ||
      s.includes('mindfulness') || s.includes('meditation')) return 'Wellness'
  if (s.includes('learn') || s.includes('education') || s.includes('knowledge') || s.includes('skill')) return 'Learning'
  if (s.includes('spiritual') || s.includes('spirituality') || s.includes('consciousness')) return 'Spirituality'
  if (s.includes('career') || s.includes('professional') || s.includes('business')) return 'Career'
  return 'Other'
}

function extractTechLiteracy(summary: string): string {
  const s = summary.toLowerCase()
  if (s.includes('not tech') || s.includes('tech challenged') || s.includes('struggle') ||
      s.includes('difficult to navigate') || s.includes('confusing') ||
      s.includes('not comfortable with tech')) return 'Low'
  if (s.includes('tech savvy') || s.includes('comfortable with tech') || s.includes('digital native')) return 'High'
  return 'Medium'
}

function extractDevicePreference(summary: string): string {
  const s = summary.toLowerCase()
  const hasMobile = s.includes('iphone') || s.includes('ios') || s.includes('mobile') ||
                    s.includes('phone') || s.includes('android')
  const hasDesktop = s.includes('desktop') || s.includes('laptop') || s.includes('computer')
  const hasTablet = s.includes('tablet') || s.includes('ipad')
  const hasApp = s.includes('app')
  const hasWeb = s.includes('web')

  if (hasApp && hasWeb && (hasMobile || hasDesktop || hasTablet)) return 'Multi-device'
  if (hasMobile) return 'Mobile'
  if (hasDesktop) return 'Desktop'
  if (hasTablet) return 'Tablet'
  return 'Mobile' // default for mobile-first product
}

function extractMembershipType(segment: string): string {
  if (segment.includes('Weekly Active')) return 'Active Member'
  if (segment.includes('EVE AI')) return 'AI Power User'
  if (segment.includes('Free')) return 'Free User'
  if (segment.includes('Refund') || segment.includes('Churned')) return 'Former Member'
  if (segment.includes('Referral')) return 'Referral User'
  if (segment.includes('[Premium]') || segment.includes('[Quest-only]')) return 'Premium Member'
  return 'Other'
}

// ─── Distribution builder ──────────────────────────────────────────────────────

function buildDistribution(values: string[]): { name: string; count: number; pct: number }[] {
  const counts: Record<string, number> = {}
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1
  }
  const total = values.length
  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; payload: { count: number; pct: number } }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const { count, pct } = payload[0].payload
  return (
    <div className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-white text-xs font-semibold mb-1">{label}</p>
      <p className="text-indigo-300 text-xs">{count} customers ({pct}%)</p>
    </div>
  )
}

// ─── AttributeChart ────────────────────────────────────────────────────────────

function AttributeChart({
  title,
  data,
}: {
  title: string
  data: { name: string; count: number; pct: number }[]
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0)

  if (data.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
        <p className="text-xs text-gray-500">No data available for this segment</p>
      </div>
    )
  }

  const chartHeight = Math.max(180, data.length * 40)

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-xs text-gray-500">{total} customers</span>
      </div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 48, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={{ stroke: '#4b5563' }}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#d1d5db', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.1)' }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#9ca3af', fontSize: 10 }}>
            {data.map((_entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={index === 0 ? '#6366f1' : '#4f46e5'}
                opacity={1 - index * 0.08 > 0.3 ? 1 - index * 0.08 : 0.3}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CustomersClient({ records }: { records: CustomerSession[] }) {
  const [activeSegments, setActiveSegments] = useState<Set<SegmentKey>>(new Set(['membership', 'premium']))

  function toggleSegment(seg: SegmentKey) {
    setActiveSegments(prev => {
      const next = new Set(prev)
      if (next.has(seg) && next.size > 1) next.delete(seg)
      else next.add(seg)
      return next
    })
  }

  // Filter records by selected segments
  const filteredRecords = useMemo(
    () => records.filter(r => activeSegments.has(classifySegment(r.segment, r.summary))),
    [records, activeSegments]
  )

  // Compute distributions for each attribute
  const distributions = useMemo(() => {
    const ages = filteredRecords.map(r => extractAge(r.summary))
    const lifeStages = filteredRecords.map(r => extractLifeStage(r.summary))
    const jobs = filteredRecords.map(r => extractJobProfession(r.summary))
    const motivations = filteredRecords.map(r => extractMotivation(r.summary))
    const techLiteracy = filteredRecords.map(r => extractTechLiteracy(r.summary))
    const devices = filteredRecords.map(r => extractDevicePreference(r.summary))
    const membershipTypes = filteredRecords.map(r => extractMembershipType(r.segment))

    return {
      age: buildDistribution(ages),
      lifeStage: buildDistribution(lifeStages),
      job: buildDistribution(jobs),
      motivation: buildDistribution(motivations),
      techLiteracy: buildDistribution(techLiteracy),
      device: buildDistribution(devices),
      membershipType: buildDistribution(membershipTypes),
    }
  }, [filteredRecords])

  const segmentCounts = useMemo(() => ({
    membership: records.filter(r => classifySegment(r.segment, r.summary) === 'membership').length,
    premium: records.filter(r => classifySegment(r.segment, r.summary) === 'premium').length,
  }), [records])

  const segmentLabel = activeSegments.size === 2
    ? 'All Segments'
    : activeSegments.has('membership') ? 'Mindvalley Membership' : 'Premium Programs'

  const segmentColor = activeSegments.size === 2
    ? 'text-gray-300'
    : activeSegments.has('membership') ? 'text-indigo-300' : 'text-amber-300'

  const dotColor = activeSegments.size === 2
    ? 'bg-gray-400'
    : activeSegments.has('membership') ? 'bg-indigo-400' : 'bg-amber-400'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Who Are Our Customers</h1>
        <p className="text-gray-400 text-sm">
          Customer research profiles — demographic and behavioural distributions by membership segment.
        </p>
      </div>

      {/* Segment toggles */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Segment:</span>
        <button
          onClick={() => toggleSegment('membership')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeSegments.has('membership')
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-gray-700'
          }`}
        >
          Mindvalley Membership
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
            activeSegments.has('membership') ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-400'
          }`}>
            {segmentCounts.membership}
          </span>
        </button>
        <button
          onClick={() => toggleSegment('premium')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeSegments.has('premium')
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-gray-700'
          }`}
        >
          Premium Programs
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
            activeSegments.has('premium') ? 'bg-amber-500 text-white' : 'bg-gray-700 text-gray-400'
          }`}>
            {segmentCounts.premium}
          </span>
        </button>
      </div>

      {/* Summary bar */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-3 flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-sm text-gray-300">
          Showing <span className="font-semibold text-white">{filteredRecords.length}</span> customer{filteredRecords.length !== 1 ? 's' : ''} in{' '}
          <span className={`font-semibold ${segmentColor}`}>{segmentLabel}</span>
        </span>
      </div>

      {/* Charts grid */}
      {filteredRecords.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <AttributeChart title="Age" data={distributions.age} />
          <AttributeChart title="Life Stage" data={distributions.lifeStage} />
          <AttributeChart title="Job / Profession" data={distributions.job} />
          <AttributeChart title="Motivation to Join Mindvalley" data={distributions.motivation} />
          <AttributeChart title="Tech Literacy / Savviness" data={distributions.techLiteracy} />
          <AttributeChart title="Device Preference" data={distributions.device} />
          <AttributeChart title="Membership Type" data={distributions.membershipType} />
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">No customer records found for this segment.</p>
        </div>
      )}
    </div>
  )
}
