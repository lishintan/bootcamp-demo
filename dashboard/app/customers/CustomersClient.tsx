'use client'

// ─── Types ────────────────────────────────────────────────────────────────────

type AiSavviness = 'Low' | 'Medium' | 'High'

interface Persona {
  id: string
  emoji: string
  name: string
  age: number
  occupation: string
  lifeStage: string
  device: string
  aiSavviness: AiSavviness
  motivation: string
  segment: string
  segmentTone: 'indigo' | 'amber' | 'emerald' | 'rose' | 'sky' | 'violet'
  quote: string
  story: string
  traits: string[]
}

// ─── Persona archetypes ─────────────────────────────────────────────────────────
// Curated from the real customer-research segments: Weekly Active, EVE AI power
// users, Free/Referral, Refunded/Churned, Premium Programs.

const PERSONAS: Persona[] = [
  {
    id: 'seeker',
    emoji: '🧘',
    name: 'Serene the Seeker',
    age: 52,
    occupation: 'Retired teacher',
    lifeStage: 'Retired',
    device: 'Mobile-first',
    aiSavviness: 'Low',
    motivation: 'Spirituality',
    segment: 'Weekly Active',
    segmentTone: 'indigo',
    quote: 'I open the app each morning for a meditation before the house wakes up — it’s become my ritual.',
    story:
      'Came to Mindvalley for inner peace after retiring. Sticks to a small handful of familiar Quests and rarely explores the catalogue. Anything that feels “technical” makes her hesitate, so she leans on the home screen and push reminders to find her way back.',
    traits: ['Routine-driven', 'Loyal', 'Needs gentle guidance'],
  },
  {
    id: 'maker',
    emoji: '🚀',
    name: 'Marcus the Maker',
    age: 34,
    occupation: 'Startup founder',
    lifeStage: 'Entrepreneur',
    device: 'Multi-device',
    aiSavviness: 'High',
    motivation: 'Personal Growth',
    segment: 'EVE AI Power User',
    segmentTone: 'violet',
    quote: 'I treat EVE like a coach on demand — I’ll ask it three things before my first coffee.',
    story:
      'An early adopter who lives across phone, laptop and tablet. Pushes every AI feature to its limit and gives blunt feedback when it falls short. High expectations: if a workflow has friction, he’ll find a workaround or churn to a competitor.',
    traits: ['Power user', 'High expectations', 'Vocal feedback'],
  },
  {
    id: 'parent',
    emoji: '👩‍👧',
    name: 'Priya the Parent',
    age: 41,
    occupation: 'Marketing manager',
    lifeStage: 'Parent',
    device: 'Mobile',
    aiSavviness: 'Medium',
    motivation: 'Wellness',
    segment: 'Weekly Active',
    segmentTone: 'emerald',
    quote: 'I get maybe 15 minutes between work and the kids — it has to be quick and worth it.',
    story:
      'Time-starved and goal-oriented. Squeezes short sessions into school runs and lunch breaks, almost always on her phone. Values bite-sized content and clear progress; abandons anything that demands a long uninterrupted block of attention.',
    traits: ['Time-poor', 'Goal-oriented', 'Bite-sized sessions'],
  },
  {
    id: 'explorer',
    emoji: '🎨',
    name: 'Elena the Explorer',
    age: 26,
    occupation: 'Freelance designer',
    lifeStage: 'Single',
    device: 'Mobile',
    aiSavviness: 'High',
    motivation: 'Learning',
    segment: 'Free / Referral',
    segmentTone: 'sky',
    quote: 'A friend sent me a link — I’m sampling everything before I decide it’s worth paying for.',
    story:
      'Joined free through a referral and is browsing widely across topics. Digitally fluent and price-sensitive — she’ll happily try AI features but won’t convert until the value is obvious. The classic “almost a member” who needs one standout moment to commit.',
    traits: ['Curious', 'Price-sensitive', 'Conversion candidate'],
  },
  {
    id: 'drifter',
    emoji: '🌊',
    name: 'Daniel the Drifter',
    age: 29,
    occupation: 'Software engineer',
    lifeStage: 'Professional',
    device: 'Desktop',
    aiSavviness: 'High',
    motivation: 'Career',
    segment: 'Refunded / Churned',
    segmentTone: 'rose',
    quote: 'I signed up with big plans, then life got busy and I just… stopped opening it.',
    story:
      'Started strong but lost momentum within weeks and ultimately refunded. Tech-savvy but never built a habit — no anchor in his day to pull him back. Represents the activation gap: high intent at signup, no sustained engagement, winnable with the right nudge.',
    traits: ['Lapsed', 'Lost the habit', 'Win-back target'],
  },
  {
    id: 'reflective',
    emoji: '🌿',
    name: 'Robert the Reflective',
    age: 67,
    occupation: 'Retired executive',
    lifeStage: 'Retired',
    device: 'Tablet',
    aiSavviness: 'Low',
    motivation: 'Spirituality',
    segment: 'Premium Programs',
    segmentTone: 'amber',
    quote: 'I prefer the bigger screen and a structured programme I can follow start to finish.',
    story:
      'A committed Premium learner who invests in deep, structured Masterclasses and Certifications. Reads on his tablet, takes notes, and follows a programme to completion. Cautious with new AI tools — he wants a clear curriculum and reassurance, not experimentation.',
    traits: ['High-value', 'Structured learner', 'Tech-cautious'],
  },
]

// ─── Tone styling ───────────────────────────────────────────────────────────────

const TONES: Record<Persona['segmentTone'], { avatar: string; chip: string; quoteBar: string }> = {
  indigo: { avatar: 'bg-indigo-900/40 ring-indigo-500/30', chip: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/50', quoteBar: 'border-indigo-500/60' },
  amber: { avatar: 'bg-amber-900/40 ring-amber-500/30', chip: 'bg-amber-900/40 text-amber-300 border-amber-700/50', quoteBar: 'border-amber-500/60' },
  emerald: { avatar: 'bg-emerald-900/40 ring-emerald-500/30', chip: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50', quoteBar: 'border-emerald-500/60' },
  rose: { avatar: 'bg-rose-900/40 ring-rose-500/30', chip: 'bg-rose-900/40 text-rose-300 border-rose-700/50', quoteBar: 'border-rose-500/60' },
  sky: { avatar: 'bg-sky-900/40 ring-sky-500/30', chip: 'bg-sky-900/40 text-sky-300 border-sky-700/50', quoteBar: 'border-sky-500/60' },
  violet: { avatar: 'bg-violet-900/40 ring-violet-500/30', chip: 'bg-violet-900/40 text-violet-300 border-violet-700/50', quoteBar: 'border-violet-500/60' },
}

// ─── AI-savviness meter ──────────────────────────────────────────────────────────

function AiMeter({ level }: { level: AiSavviness }) {
  const filled = level === 'Low' ? 1 : level === 'Medium' ? 2 : 3
  return (
    <span className="inline-flex items-center gap-1" aria-label={`AI savviness: ${level}`}>
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
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500 flex items-center gap-1.5">
        <span aria-hidden>{icon}</span>
        {label}
      </span>
      <span className="text-gray-200 font-medium flex items-center gap-1.5">{children}</span>
    </div>
  )
}

// ─── Persona card ────────────────────────────────────────────────────────────────

function PersonaCard({ p }: { p: Persona }) {
  const tone = TONES[p.segmentTone]
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col gap-4 hover:border-gray-600 transition-all duration-200">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl ring-1 ${tone.avatar}`}>
          <span aria-hidden>{p.emoji}</span>
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white leading-tight">{p.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{p.age} · {p.occupation}</p>
        </div>
      </div>

      {/* Quote */}
      <blockquote className={`border-l-2 ${tone.quoteBar} pl-3 text-sm text-gray-300 italic leading-snug`}>
        “{p.quote}”
      </blockquote>

      {/* Story */}
      <p className="text-xs text-gray-400 leading-relaxed">{p.story}</p>

      {/* Attributes */}
      <div className="space-y-2 border-t border-gray-700/70 pt-3">
        <AttrRow icon="📱" label="Device">{p.device}</AttrRow>
        <AttrRow icon="🤖" label="AI savviness">
          <AiMeter level={p.aiSavviness} />
          <span className="text-gray-300">{p.aiSavviness}</span>
        </AttrRow>
        <AttrRow icon="🧭" label="Life stage">{p.lifeStage}</AttrRow>
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

export default function CustomersClient({ totalCustomers }: { totalCustomers: number }) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Who Are Our Customers</h1>
        <p className="text-gray-400 text-sm">
          Six archetypes that capture how different Mindvalley users show up — their devices, AI comfort,
          life stage and what drives them.
        </p>
      </div>

      {/* Summary bar */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-3 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-indigo-400" />
        <span className="text-sm text-gray-300">
          <span className="font-semibold text-white">{PERSONAS.length}</span> persona archetypes
          {totalCustomers > 0 && (
            <> · distilled from <span className="font-semibold text-white">{totalCustomers}</span> customer interviews</>
          )}
        </span>
      </div>

      {/* Persona grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {PERSONAS.map(p => (
          <PersonaCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  )
}
