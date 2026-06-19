'use client'

// ─── Types ────────────────────────────────────────────────────────────────────

type AiSavviness = 'Low' | 'Medium' | 'High'

interface Persona {
  id: string
  emoji: string
  name: string
  ageRange: string
  roles: string
  lifeStage: string
  device: string
  aiSavviness: AiSavviness
  aiNote: string
  motivation: string
  segment: string
  segmentTone: 'indigo' | 'amber' | 'emerald' | 'rose' | 'sky' | 'violet'
  prevalence: string
  quote: string
  story: string
  traits: string[]
}

// ─── Persona archetypes ─────────────────────────────────────────────────────────
// Each card describes a CLUSTER of customers — generalized ranges and tendencies,
// not a single individual. Distilled from the real research segments: Weekly
// Active, EVE AI power users, Free/Referral, Refunded/Churned, Premium Programs.

const PERSONAS: Persona[] = [
  {
    id: 'seekers',
    emoji: '🧘',
    name: 'The Seekers',
    ageRange: '45–65',
    roles: 'Retirees, teachers, nurses, caregivers',
    lifeStage: 'Empty-nesters & retirees',
    device: 'Primarily mobile',
    aiSavviness: 'Low',
    aiNote: 'Mostly low — wary of new tools',
    motivation: 'Spirituality & wellbeing',
    segment: 'Weekly Active',
    segmentTone: 'indigo',
    prevalence: 'Large, highly loyal',
    quote: 'I open the app each morning for a meditation before the house wakes up — it’s become my ritual.',
    story:
      'A large, devoted core who come to Mindvalley for inner peace and calm. They tend to stick to a handful of familiar Quests rather than explore the catalogue, and anything that feels “technical” gives them pause. Most rely on the home screen and push reminders to find their way back.',
    traits: ['Routine-driven', 'Loyal', 'Needs gentle guidance'],
  },
  {
    id: 'makers',
    emoji: '🚀',
    name: 'The Makers',
    ageRange: '28–42',
    roles: 'Founders, freelancers, ambitious professionals',
    lifeStage: 'Career-building & entrepreneurial',
    device: 'Multi-device',
    aiSavviness: 'High',
    aiNote: 'Very high — power users of EVE',
    motivation: 'Personal growth & performance',
    segment: 'EVE AI Power User',
    segmentTone: 'violet',
    prevalence: 'Small but fast-growing',
    quote: 'I treat EVE like a coach on demand — I’ll ask it three things before my first coffee.',
    story:
      'Early adopters who live across phone, laptop and tablet and push every AI feature to its limit. They set a high bar and give blunt feedback when it isn’t met. Where a workflow has friction, they’ll find a workaround — or churn to a competitor that removes it.',
    traits: ['Power users', 'High expectations', 'Vocal feedback'],
  },
  {
    id: 'parents',
    emoji: '👨‍👩‍👧',
    name: 'The Busy Parents',
    ageRange: '35–48',
    roles: 'Managers, professionals juggling family',
    lifeStage: 'Raising children',
    device: 'Mostly mobile, on the go',
    aiSavviness: 'Medium',
    aiNote: 'Comfortable but pragmatic',
    motivation: 'Wellness & balance',
    segment: 'Weekly Active',
    segmentTone: 'emerald',
    prevalence: 'Large core segment',
    quote: 'I get maybe 15 minutes between work and the kids — it has to be quick and worth it.',
    story:
      'Time-starved and goal-oriented. They squeeze short sessions into school runs and lunch breaks, almost always on their phones. They value bite-sized content and visible progress, and tend to abandon anything that demands a long, uninterrupted block of attention.',
    traits: ['Time-poor', 'Goal-oriented', 'Bite-sized sessions'],
  },
  {
    id: 'explorers',
    emoji: '🎨',
    name: 'The Explorers',
    ageRange: '22–32',
    roles: 'Students, creatives, early-career',
    lifeStage: 'Young & single',
    device: 'Mobile-native',
    aiSavviness: 'High',
    aiNote: 'Digitally fluent, AI-curious',
    motivation: 'Learning & discovery',
    segment: 'Free / Referral',
    segmentTone: 'sky',
    prevalence: 'High-volume top-of-funnel',
    quote: 'A friend sent me a link — I’m sampling everything before I decide it’s worth paying for.',
    story:
      'Mostly arrive free, through referrals, and browse widely across topics. Digitally fluent and price-sensitive, they’ll happily try AI features but won’t convert until the value is obvious. The classic “almost members” — each needs one standout moment to commit.',
    traits: ['Curious', 'Price-sensitive', 'Conversion candidates'],
  },
  {
    id: 'drifters',
    emoji: '🌊',
    name: 'The Drifters',
    ageRange: '25–40',
    roles: 'Professionals across many fields',
    lifeStage: 'Mixed — busy working life',
    device: 'Split mobile & desktop',
    aiSavviness: 'Medium',
    aiNote: 'Capable, but never hooked',
    motivation: 'Self-improvement (stalled)',
    segment: 'Refunded / Churned',
    segmentTone: 'rose',
    prevalence: 'At-risk / win-back',
    quote: 'I signed up with big plans, then life got busy and I just… stopped opening it.',
    story:
      'Started strong but lost momentum within weeks, and many ultimately refunded. They never built a habit — no anchor in the day to pull them back. They represent the activation gap: high intent at signup, little sustained engagement, and winnable with the right nudge.',
    traits: ['Lapsed', 'Lost the habit', 'Win-back target'],
  },
  {
    id: 'devotees',
    emoji: '🌿',
    name: 'The Devotees',
    ageRange: '50–70',
    roles: 'Executives, established professionals, retirees',
    lifeStage: 'Settled & investing in themselves',
    device: 'Often tablet & desktop',
    aiSavviness: 'Low',
    aiNote: 'Cautious — wants curriculum, not experiments',
    motivation: 'Mastery & deep growth',
    segment: 'Premium Programs',
    segmentTone: 'amber',
    prevalence: 'Small, high-value',
    quote: 'I prefer the bigger screen and a structured programme I can follow start to finish.',
    story:
      'Committed Premium learners who invest in deep, structured Masterclasses and Certifications. They favour larger screens, take notes and follow programmes to completion. They’re cautious with new AI tools, wanting a clear curriculum and reassurance over experimentation.',
    traits: ['High-value', 'Structured learners', 'Tech-cautious'],
  },
]

// ─── Tone styling ───────────────────────────────────────────────────────────────

const TONES: Record<Persona['segmentTone'], { avatar: string; chip: string; quoteBar: string; bar: string; text: string }> = {
  indigo: { avatar: 'bg-indigo-900/40 ring-indigo-500/30', chip: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/50', quoteBar: 'border-indigo-500/60', bar: 'bg-indigo-500', text: 'text-indigo-300' },
  amber: { avatar: 'bg-amber-900/40 ring-amber-500/30', chip: 'bg-amber-900/40 text-amber-300 border-amber-700/50', quoteBar: 'border-amber-500/60', bar: 'bg-amber-500', text: 'text-amber-300' },
  emerald: { avatar: 'bg-emerald-900/40 ring-emerald-500/30', chip: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50', quoteBar: 'border-emerald-500/60', bar: 'bg-emerald-500', text: 'text-emerald-300' },
  rose: { avatar: 'bg-rose-900/40 ring-rose-500/30', chip: 'bg-rose-900/40 text-rose-300 border-rose-700/50', quoteBar: 'border-rose-500/60', bar: 'bg-rose-500', text: 'text-rose-300' },
  sky: { avatar: 'bg-sky-900/40 ring-sky-500/30', chip: 'bg-sky-900/40 text-sky-300 border-sky-700/50', quoteBar: 'border-sky-500/60', bar: 'bg-sky-500', text: 'text-sky-300' },
  violet: { avatar: 'bg-violet-900/40 ring-violet-500/30', chip: 'bg-violet-900/40 text-violet-300 border-violet-700/50', quoteBar: 'border-violet-500/60', bar: 'bg-violet-500', text: 'text-violet-300' },
}

// ─── AI-savviness meter ──────────────────────────────────────────────────────────

function AiMeter({ level }: { level: AiSavviness }) {
  const filled = level === 'Low' ? 1 : level === 'Medium' ? 2 : 3
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Typical AI savviness: ${level}`}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={`w-1.5 h-3 rounded-sm ${i < filled ? 'bg-indigo-400' : 'bg-gray-700'}`}
        />
      ))}
    </span>
  )
}

// ─── Attribute row ───────────────────────────────────────────────────────────────

function AttrRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between text-xs gap-3">
      <span className="text-gray-500 flex items-center gap-1.5 shrink-0">
        <span aria-hidden>{icon}</span>
        {label}
      </span>
      <span className="text-gray-200 font-medium flex items-center gap-1.5 text-right">{children}</span>
    </div>
  )
}

// ─── Persona card ────────────────────────────────────────────────────────────────

function PersonaCard({ p, count, pct, rank }: { p: Persona; count: number; pct: number; rank: number }) {
  const tone = TONES[p.segmentTone]
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col gap-4 hover:border-gray-600 transition-all duration-200">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl ring-1 ${tone.avatar}`}>
          <span aria-hidden>{p.emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white leading-tight">{p.name}</h3>
            {rank === 1 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-300">
                #1 largest
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{p.prevalence}</p>
        </div>
      </div>

      {/* Size */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm">
            <span className={`font-bold ${tone.text}`}>{count}</span>
            <span className="text-gray-500"> customers</span>
          </span>
          <span className="text-sm font-semibold text-white">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-700 overflow-hidden" role="img" aria-label={`${pct}% of customers`}>
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Representative quote */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-600 mb-1">Representative voice</p>
        <blockquote className={`border-l-2 ${tone.quoteBar} pl-3 text-sm text-gray-300 italic leading-snug`}>
          “{p.quote}”
        </blockquote>
      </div>

      {/* Group description */}
      <p className="text-xs text-gray-400 leading-relaxed">{p.story}</p>

      {/* Generalized attributes */}
      <div className="space-y-2 border-t border-gray-700/70 pt-3">
        <AttrRow icon="🎂" label="Age range">{p.ageRange}</AttrRow>
        <AttrRow icon="💼" label="Common roles">{p.roles}</AttrRow>
        <AttrRow icon="🧭" label="Life stage">{p.lifeStage}</AttrRow>
        <AttrRow icon="📱" label="Devices">{p.device}</AttrRow>
        <AttrRow icon="🤖" label="AI savviness">
          <AiMeter level={p.aiSavviness} />
          <span className="text-gray-300">{p.aiNote}</span>
        </AttrRow>
        <AttrRow icon="✨" label="Motivation">{p.motivation}</AttrRow>
      </div>

      {/* Traits + segment */}
      <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
        {p.traits.map(t => (
          <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700/60 text-gray-300 border border-gray-600/50">
            {t}
          </span>
        ))}
      </div>
      <div className={`text-[11px] px-2 py-1 rounded-md border self-start ${tone.chip}`}>
        {p.segment}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CustomersClient({
  counts,
  totalCustomers,
}: {
  counts: Record<string, number>
  totalCustomers: number
}) {
  // Merge sizes into personas and sort largest-first
  const sized = PERSONAS.map(p => {
    const count = counts[p.id] ?? 0
    const pct = totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0
    return { p, count, pct }
  }).sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Who Are Our Customers</h1>
        <p className="text-gray-400 text-sm">
          Six customer segments, sized by how many of our interviewed customers fall into each.
          Every card generalizes a cluster — typical age range, roles, devices, AI comfort and motivation.
        </p>
      </div>

      {/* Segment-size overview */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Segment sizes</h2>
          <span className="text-xs text-gray-500">
            {PERSONAS.length} segments · {totalCustomers} customer interviews
          </span>
        </div>
        {/* Stacked proportion bar */}
        <div className="flex h-3 rounded-full overflow-hidden mb-3" role="img" aria-label="Relative segment sizes">
          {sized.map(({ p, pct }) => (
            pct > 0 ? <div key={p.id} className={TONES[p.segmentTone].bar} style={{ width: `${pct}%` }} title={`${p.name}: ${pct}%`} /> : null
          ))}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {sized.map(({ p, count, pct }) => (
            <div key={p.id} className="flex items-center gap-2 text-xs">
              <span className={`w-2.5 h-2.5 rounded-sm ${TONES[p.segmentTone].bar}`} />
              <span className="text-gray-300">{p.name}</span>
              <span className="text-gray-500">{count} · {pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Persona grid (largest first) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sized.map(({ p, count, pct }, i) => (
          <PersonaCard key={p.id} p={p} count={count} pct={pct} rank={i + 1} />
        ))}
      </div>
    </div>
  )
}
