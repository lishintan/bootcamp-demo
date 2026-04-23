'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { InsightGroup } from '@/lib/clustering'
import UserSearchCombobox from '@/components/UserSearchCombobox'

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAMS: { name: string; jiraNames: string[]; color: string; icon: string }[] = [
  { name: 'Transform', jiraNames: ['Transform Stream', 'Transform'], color: 'indigo', icon: '⚡' },
  { name: 'Engage', jiraNames: ['Engage Stream', 'Engage'], color: 'emerald', icon: '💬' },
  { name: 'Identity & Payments', jiraNames: ['IP Team', 'Identity & Payments'], color: 'purple', icon: '🔐' },
  { name: 'Academy', jiraNames: ['Academy', 'Academy Stream', 'PBS Stream'], color: 'amber', icon: '🎓' },
  { name: 'Acquire', jiraNames: ['Acquire Stream', 'Acquire'], color: 'orange', icon: '🚀' },
  { name: 'AI & Innovation', jiraNames: ['AI & Innovation Stream', 'AI & Innovation'], color: 'cyan', icon: '🤖' },
  { name: 'Content Ops', jiraNames: ['Content Ops'], color: 'gray', icon: '📦' },
]

const TEAM_COLORS: Record<string, { border: string; bg: string; text: string; selectedBg: string; selectedBorder: string }> = {
  indigo: {
    border: 'border-indigo-800',
    bg: 'bg-indigo-950/40',
    text: 'text-indigo-300',
    selectedBg: 'bg-indigo-700',
    selectedBorder: 'border-indigo-400',
  },
  emerald: {
    border: 'border-emerald-800',
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-300',
    selectedBg: 'bg-emerald-700',
    selectedBorder: 'border-emerald-400',
  },
  purple: {
    border: 'border-purple-800',
    bg: 'bg-purple-950/40',
    text: 'text-purple-300',
    selectedBg: 'bg-purple-700',
    selectedBorder: 'border-purple-400',
  },
  amber: {
    border: 'border-amber-800',
    bg: 'bg-amber-950/40',
    text: 'text-amber-300',
    selectedBg: 'bg-amber-700',
    selectedBorder: 'border-amber-400',
  },
  cyan: {
    border: 'border-cyan-800',
    bg: 'bg-cyan-950/40',
    text: 'text-cyan-300',
    selectedBg: 'bg-cyan-700',
    selectedBorder: 'border-cyan-400',
  },
  orange: {
    border: 'border-orange-800',
    bg: 'bg-orange-950/40',
    text: 'text-orange-300',
    selectedBg: 'bg-orange-700',
    selectedBorder: 'border-orange-400',
  },
  gray: {
    border: 'border-gray-700',
    bg: 'bg-gray-800/40',
    text: 'text-gray-300',
    selectedBg: 'bg-gray-600',
    selectedBorder: 'border-gray-400',
  },
}

const JIRA_BASE_URL = 'https://mindvalley.atlassian.net'
const STORAGE_KEY = 'pid_selected_user'

// ─── Bookmark types ───────────────────────────────────────────────────────────

interface Bookmark {
  id: string
  insightId: string
  insightHook: string
  insightCategory: 'Bug' | 'Feedback'
  insightTemperature: 'Hot' | 'Medium' | 'Cold'
  teamName: string
  bookmarkedBy: string
  bookmarkedAt: string
  status: 'open' | 'archived'
}

// ─── Badge components ─────────────────────────────────────────────────────────

function TemperatureBadge({
  temperature,
  score,
}: {
  temperature: InsightGroup['temperature']
  score: number
}) {
  const styles = {
    Hot: 'bg-red-900/60 text-red-300 border border-red-700',
    Medium: 'bg-amber-900/60 text-amber-300 border border-amber-700',
    Cold: 'bg-blue-900/60 text-blue-300 border border-blue-700',
  }
  const icons = { Hot: '🔥', Medium: '🌡', Cold: '❄️' }
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${styles[temperature]}`}>
      {icons[temperature]} {temperature}
      <span className="opacity-60 font-normal ml-0.5">·{score}</span>
    </span>
  )
}

function WhyTagBadge({ tag }: { tag: InsightGroup['whyTag'] }) {
  const styles = {
    Friction: 'bg-red-900/50 text-red-300',
    Delight: 'bg-green-900/50 text-green-300',
    Retention: 'bg-orange-900/50 text-orange-300',
    Revenue: 'bg-purple-900/50 text-purple-300',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[tag]}`}>
      {tag}
    </span>
  )
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 border border-gray-600">
      {source}
    </span>
  )
}

function CategoryBadge({ category }: { category: InsightGroup['category'] }) {
  const styles = {
    Bug: 'bg-red-900/50 text-red-300 border border-red-700',
    Feedback: 'bg-blue-900/50 text-blue-300 border border-blue-700',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${styles[category]}`}>
      {category}
    </span>
  )
}

// ─── Bookmark Icon Button ─────────────────────────────────────────────────────

function BookmarkButton({
  isBookmarked,
  isSaving,
  onClick,
  className,
}: {
  isBookmarked: boolean
  isSaving: boolean
  onClick: (e: React.MouseEvent) => void
  className?: string
}) {
  return (
    <button
      aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark insight'}
      onClick={onClick}
      disabled={isSaving}
      className={`text-gray-600 hover:text-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-wait ${className ?? ''}`}
    >
      {isSaving ? (
        <svg className="w-4 h-4 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : isBookmarked ? (
        <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      )}
    </button>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  group,
  onClose,
  bookmarkedIds,
  savingIds,
  onToggleBookmark,
}: {
  group: InsightGroup
  onClose: () => void
  bookmarkedIds: Set<string>
  savingIds: Set<string>
  onToggleBookmark: (group: InsightGroup) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [showAllTickets, setShowAllTickets] = useState(false)

  // Escape key handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Focus trap
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const focusableSelectors =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    const focusableElements = panel.querySelectorAll<HTMLElement>(focusableSelectors)
    const first = focusableElements[0]
    const last = focusableElements[focusableElements.length - 1]

    // Focus the panel on open
    first?.focus()

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      if (focusableElements.length === 0) return
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [])

  // Format recency date
  const formattedRecency = group.recency
    ? new Date(group.recency).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—'

  // Tickets list
  const ticketsToShow = showAllTickets
    ? group.tickets
    : group.tickets.slice(0, 20)

  const jiraTicketUrl = (key: string) =>
    `${JIRA_BASE_URL}/browse/${key}`

  const isBookmarked = bookmarkedIds.has(group.id)
  const isSaving = savingIds.has(group.id)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Insight detail"
        className="fixed top-0 right-0 h-full w-full max-w-[560px] bg-gray-900 border-l border-gray-700 z-50 flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                {/* Badges row */}
                <div className="flex flex-wrap gap-1.5">
                  <CategoryBadge category={group.category} />
                  <TemperatureBadge temperature={group.temperature} score={group.temperatureScore} />
                  <WhyTagBadge tag={group.whyTag} />
                </div>
                {/* Title */}
                <h2 className="text-base font-semibold text-white leading-snug">
                  {group.title || group.hook}
                </h2>
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Bookmark button in detail panel */}
                <BookmarkButton
                  isBookmarked={isBookmarked}
                  isSaving={isSaving}
                  onClick={e => { e.stopPropagation(); onToggleBookmark(group) }}
                  className="p-1.5 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {/* Close button */}
                <button
                  onClick={onClose}
                  aria-label="Close detail panel"
                  className="text-gray-400 hover:text-white transition-colors rounded-lg p-1.5 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-700" />

            {/* AI Summary */}
            <section aria-label="AI-generated summary" className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Insight</h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                {group.aiSummary || group.hook}
              </p>
            </section>

            {/* Divider */}
            <div className="border-t border-gray-700" />

            {/* Temperature Breakdown */}
            <section aria-label="Temperature breakdown" className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Temperature Breakdown</h3>
              <div className="bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-400">Frequency</span>
                  <span className="text-sm font-semibold text-white">{group.frequency} reports</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-400">Impact Score</span>
                  <span className="text-sm font-semibold text-white">
                    {group.impactScore > 0 ? group.impactScore.toFixed(1) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-400">Most Recent</span>
                  <span className="text-sm font-semibold text-white">{formattedRecency}</span>
                </div>
              </div>
            </section>

            {/* Divider */}
            <div className="border-t border-gray-700" />

            {/* Ticket List */}
            <section aria-label="Tickets in this group" className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Tickets ({group.tickets.length})
              </h3>
              <ul className="space-y-1.5">
                {ticketsToShow.map(ticket => (
                  <li key={ticket.key}>
                    <a
                      href={jiraTicketUrl(ticket.key)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 font-mono font-medium hover:underline transition-colors group/link"
                    >
                      {ticket.key}
                      <svg className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {ticket.summary && (
                        <span className="text-gray-500 font-sans font-normal truncate max-w-[300px]">
                          — {ticket.summary}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
              {group.tickets.length > 20 && !showAllTickets && (
                <button
                  onClick={() => setShowAllTickets(true)}
                  className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors underline"
                >
                  Show all {group.tickets.length} tickets
                </button>
              )}
              {showAllTickets && group.tickets.length > 20 && (
                <button
                  onClick={() => setShowAllTickets(false)}
                  className="text-sm text-gray-400 hover:text-gray-300 font-medium transition-colors underline"
                >
                  Show fewer
                </button>
              )}
            </section>

            {/* Divider */}
            <div className="border-t border-gray-700" />

            {/* Feature & Team labels */}
            <section aria-label="Feature and team metadata" className="space-y-2">
              {group.featureName && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14">Feature</span>
                  <span className="text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-full px-3 py-0.5">
                    {group.featureName}
                  </span>
                </div>
              )}
              {group.teamName && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14">Team</span>
                  <span className="text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-full px-3 py-0.5">
                    {group.teamName}
                  </span>
                </div>
              )}
            </section>

          </div>
        </div>
      </div>
    </>
  )
}

// ─── Insight Card ─────────────────────────────────────────────────────────────

function InsightCard({
  group,
  onSelect,
  isBookmarked,
  isSaving,
  onToggleBookmark,
}: {
  group: InsightGroup
  onSelect: (group: InsightGroup) => void
  isBookmarked: boolean
  isSaving: boolean
  onToggleBookmark: (group: InsightGroup) => void
}) {
  const primarySource = group.sources[0] ?? null

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`View details for insight: ${group.title || group.representativeTicket.summary}`}
      onClick={() => onSelect(group)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(group)
        }
      }}
      className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-500 transition-all duration-150 flex flex-col gap-3 relative group/card cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-950"
    >
      {/* Bookmark icon */}
      <div className={`absolute top-3 right-3 transition-opacity ${isBookmarked ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'}`}>
        <BookmarkButton
          isBookmarked={isBookmarked}
          isSaving={isSaving}
          onClick={e => { e.stopPropagation(); onToggleBookmark(group) }}
        />
      </div>

      {/* Top badges row */}
      <div className="flex flex-wrap gap-1.5 pr-6">
        <TemperatureBadge temperature={group.temperature} score={group.temperatureScore} />
        <WhyTagBadge tag={group.whyTag} />
        {primarySource && <SourceBadge source={primarySource} />}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-white leading-snug">{group.title || group.representativeTicket.summary}</h3>

      {/* AI Summary */}
      {group.aiSummary && (
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{group.aiSummary}</p>
      )}

      {/* Frequency */}
      <div className="text-xs text-gray-400">
        <span className="font-semibold text-gray-200">{group.frequency}</span>{' '}
        {group.frequency === 1 ? 'report' : 'reports'}
      </div>

      {/* Footer meta */}
      <div className="flex flex-col gap-0.5 mt-auto">
        {group.featureName && (
          <span className="text-xs text-gray-500 truncate">
            Feature: <span className="text-gray-400">{group.featureName}</span>
          </span>
        )}
        {group.teamName && (
          <span className="text-xs text-gray-500 truncate">
            Team: <span className="text-gray-400">{group.teamName}</span>
          </span>
        )}
        <span className="text-xs text-gray-600 uppercase tracking-wide font-medium mt-1">
          {group.category}
        </span>
      </div>
    </div>
  )
}

// ─── Category Section ─────────────────────────────────────────────────────────

const PAGE_SIZE = 10

function CategorySection({
  title,
  groups,
  accentClass,
  onSelectGroup,
  bookmarkedIds,
  savingIds,
  onToggleBookmark,
}: {
  title: string
  groups: InsightGroup[]
  accentClass: string
  onSelectGroup: (group: InsightGroup) => void
  bookmarkedIds: Set<string>
  savingIds: Set<string>
  onToggleBookmark: (group: InsightGroup) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(1)

  const top8 = groups.slice(0, 8)
  const totalPages = Math.ceil(groups.length / PAGE_SIZE)
  const paginatedGroups = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleShowAll = () => {
    setShowAll(true)
    setPage(1)
  }

  const handleShowLess = () => {
    setShowAll(false)
    setPage(1)
  }

  if (groups.length === 0) return null

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full ${accentClass}`}>
          {groups.length} insights
        </span>
      </div>

      {/* Cards */}
      {!showAll ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {top8.map(g => (
            <InsightCard
              key={g.id}
              group={g}
              onSelect={onSelectGroup}
              isBookmarked={bookmarkedIds.has(g.id)}
              isSaving={savingIds.has(g.id)}
              onToggleBookmark={onToggleBookmark}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {paginatedGroups.map(g => (
            <InsightCard
              key={g.id}
              group={g}
              onSelect={onSelectGroup}
              isBookmarked={bookmarkedIds.has(g.id)}
              isSaving={savingIds.has(g.id)}
              onToggleBookmark={onToggleBookmark}
            />
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!showAll && groups.length > 8 && (
            <button
              onClick={handleShowAll}
              className="text-sm text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
            >
              Show All {title} →
            </button>
          )}
          {showAll && (
            <button
              onClick={handleShowLess}
              className="text-sm text-gray-400 hover:text-gray-300 font-medium flex items-center gap-1 transition-colors"
            >
              ← Show Less
            </button>
          )}
        </div>

        {/* Pagination when expanded */}
        {showAll && totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            <span className="text-xs text-gray-500 px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Bookmarked Insights Section ───────────────────────────────────────────────

function BookmarkedInsightsSection({
  selectedTeams,
  refreshKey,
  allGroups,
  onSelectGroup,
}: {
  selectedTeams: string[]
  refreshKey: number
  allGroups: InsightGroup[]
  onSelectGroup: (group: InsightGroup) => void
}) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [teamFilter, setTeamFilter] = useState<string>('All Teams')
  const [archivingId, setArchivingId] = useState<string | null>(null)

  // Determine active team for the bookmark query
  const activeTeam = selectedTeams.length === 1
    ? selectedTeams[0]
    : selectedTeams.length > 1
      ? 'All Teams'
      : teamFilter

  const fetchBookmarks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('status', showArchived ? 'archived' : 'open')
      // Fetch all and filter client-side — avoids display name vs Jira name mismatch

      const resp = await fetch(`/api/bookmarks?${params.toString()}`)
      if (!resp.ok) { setBookmarks([]); return }
      const data = await resp.json() as { bookmarks: Bookmark[] }
      let all = data.bookmarks ?? []

      if (activeTeam !== 'All Teams') {
        const team = TEAMS.find(t => t.name === activeTeam)
        if (team) {
          const jiraNames = new Set(team.jiraNames)
          all = all.filter(b => jiraNames.has(b.teamName))
        }
      }

      setBookmarks(all)
    } catch {
      setBookmarks([])
    } finally {
      setLoading(false)
    }
  }, [showArchived, activeTeam])

  useEffect(() => {
    fetchBookmarks()
  }, [fetchBookmarks, refreshKey])

  async function handleArchive(bookmark: Bookmark) {
    setArchivingId(bookmark.id)
    try {
      const newStatus = bookmark.status === 'open' ? 'archived' : 'open'
      const resp = await fetch(`/api/bookmarks/${bookmark.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!resp.ok) throw new Error('Failed to update bookmark')
      // Refresh list
      await fetchBookmarks()
    } catch {
      // Silently fail and refresh
      await fetchBookmarks()
    } finally {
      setArchivingId(null)
    }
  }

  return (
    <section className="border-t border-gray-800 pt-8 space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Bookmarked Insights</h2>
          {!loading && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-800">
              {bookmarks.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Team filter dropdown — only shown when no team filter is active */}
          {selectedTeams.length === 0 && (
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="appearance-none bg-gray-800 text-sm text-gray-300 rounded-lg px-3 py-1.5 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="All Teams">All Teams</option>
              {TEAMS.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          )}

          {/* Open / Archived toggle */}
          <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 p-0.5">
            <button
              onClick={() => setShowArchived(false)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                !showArchived
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Open
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                showArchived
                  ? 'bg-gray-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Archived
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2 animate-pulse">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-16 bg-gray-800 rounded-xl border border-gray-700" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && bookmarks.length === 0 && (
        <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-8 text-center">
          <svg className="w-8 h-8 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <p className="text-sm text-gray-500">
            {showArchived
              ? 'No archived bookmarks.'
              : 'No bookmarks yet. Click the bookmark icon on any insight card to save it here.'}
          </p>
        </div>
      )}

      {/* Bookmark list */}
      {!loading && !error && bookmarks.length > 0 && (
        <ul className="space-y-2">
          {bookmarks.map(bm => {
            const matchedGroup = allGroups.find(g => g.id === bm.insightId)
            return (
            <li
              key={bm.id}
              onClick={() => matchedGroup && onSelectGroup(matchedGroup)}
              className={`bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 flex items-start justify-between gap-4 ${matchedGroup ? 'cursor-pointer hover:border-gray-500 hover:bg-gray-750 transition-colors' : ''}`}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm text-white font-medium leading-snug line-clamp-2">
                  {bm.insightHook}
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    bm.insightCategory === 'Bug'
                      ? 'bg-red-900/40 text-red-300'
                      : 'bg-blue-900/40 text-blue-300'
                  }`}>
                    {bm.insightCategory}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    bm.insightTemperature === 'Hot'
                      ? 'bg-red-900/40 text-red-300'
                      : bm.insightTemperature === 'Medium'
                      ? 'bg-amber-900/40 text-amber-300'
                      : 'bg-blue-900/40 text-blue-300'
                  }`}>
                    {bm.insightTemperature}
                  </span>
                  {bm.teamName && (
                    <span className="text-xs text-gray-500">{bm.teamName}</span>
                  )}
                  <span className="text-xs text-gray-600">
                    Bookmarked by <span className="text-gray-400">{bm.bookmarkedBy}</span>
                    {' · '}
                    {new Date(bm.bookmarkedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleArchive(bm) }}
                disabled={archivingId === bm.id}
                className="flex-shrink-0 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-wait whitespace-nowrap"
              >
                {archivingId === bm.id
                  ? '…'
                  : bm.status === 'open'
                  ? 'Remove'
                  : 'Restore'}
              </button>
            </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ─── Name Prompt Modal ────────────────────────────────────────────────────────

function NamePromptModal({
  onSelect,
  onCancel,
}: {
  onSelect: (name: string) => void
  onCancel: () => void
}) {
  const [users, setUsers] = useState<{ id: string; preferredName: string }[]>([])
  const [selected, setSelected] = useState('')

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then((d: { success: boolean; users: { id: string; preferredName: string }[] }) => {
        if (d.success) setUsers(d.users)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative bg-gray-800 border border-gray-600 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-white font-semibold text-base mb-1">Who are you?</h3>
        <p className="text-gray-400 text-sm mb-4">Search and select your name to save this bookmark.</p>
        <UserSearchCombobox
          users={users}
          value={selected}
          onChange={setSelected}
          placeholder="Search your name…"
          inputClassName="w-full appearance-none bg-gray-700 text-white text-sm rounded-lg px-3 py-2.5 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        />
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => { if (selected) onSelect(selected) }}
            disabled={!selected}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2 transition-colors"
          >
            Save Bookmark
          </button>
          <button
            onClick={onCancel}
            className="px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg py-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Team Filter Screen ───────────────────────────────────────────────────────

function TeamFilterScreen({
  onApply,
  onSkip,
}: {
  onApply: (teams: string[]) => void
  onSkip: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (teamName: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(teamName)) next.delete(teamName)
      else next.add(teamName)
      return next
    })
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">Filter by Team</h1>
          <p className="text-gray-400 text-sm">
            Select one or more teams to focus your insights view. You can skip to see all teams.
          </p>
        </div>

        {/* Team grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {TEAMS.map(team => {
            const isSelected = selected.has(team.name)
            const colors = TEAM_COLORS[team.color]
            return (
              <button
                key={team.name}
                onClick={() => toggle(team.name)}
                className={[
                  'relative rounded-xl border-2 p-5 text-left transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500',
                  isSelected
                    ? `${colors.selectedBg} ${colors.selectedBorder} text-white`
                    : `${colors.bg} ${colors.border} hover:border-gray-500`,
                ].join(' ')}
              >
                {/* Selected checkmark */}
                {isSelected && (
                  <div className="absolute top-2.5 right-2.5 w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                <div className="text-2xl mb-2">{team.icon}</div>
                <div className={`font-semibold text-sm ${isSelected ? 'text-white' : colors.text}`}>
                  {team.name}
                </div>
              </button>
            )
          })}
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {selected.size > 0
              ? `${selected.size} team${selected.size !== 1 ? 's' : ''} selected`
              : 'No teams selected — applies to all'}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onSkip}
              className="text-sm text-gray-400 hover:text-gray-200 font-medium transition-colors px-4 py-2 rounded-lg hover:bg-gray-800"
            >
              Skip
            </button>
            <button
              onClick={() => onApply(Array.from(selected))}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {selected.size > 0 ? 'View Insights' : 'View All Insights'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Tabs skeleton */}
      <div className="flex gap-2">
        <div className="h-9 w-36 bg-gray-700 rounded-lg" />
        <div className="h-9 w-36 bg-gray-800 rounded-lg" />
      </div>
      {/* Section skeleton */}
      {[0, 1].map(s => (
        <div key={s} className="space-y-4">
          <div className="h-6 w-32 bg-gray-700 rounded" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-4 space-y-3 h-48">
                <div className="h-4 bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-700 rounded" />
                <div className="h-3 bg-gray-700 rounded w-5/6" />
                <div className="h-3 bg-gray-700 rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

type Tab = 'open' | 'deprioritized'

interface InsightData {
  groups: InsightGroup[]
}

export default function InsightsClient() {
  const [phase, setPhase] = useState<'filter' | 'view'>('filter')
  const [selectedTeams, setSelectedTeams] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('open')

  // Data for both tabs (loaded in parallel)
  const [openData, setOpenData] = useState<InsightData | null>(null)
  const [deprioritizedData, setDeprioritizedData] = useState<InsightData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Detail panel state
  const [selectedGroup, setSelectedGroup] = useState<InsightGroup | null>(null)

  // Bookmark state
  const [currentUser, setCurrentUser] = useState<string>('')
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set())
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [bookmarkError, setBookmarkError] = useState<string | null>(null)
  const [pendingBookmark, setPendingBookmark] = useState<InsightGroup | null>(null)
  const [bookmarkRefreshKey, setBookmarkRefreshKey] = useState(0)

  // Load current user from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? ''
    setCurrentUser(saved)

    // Cross-tab: storage event
    function handleStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setCurrentUser(e.newValue ?? '')
    }
    // Same-tab: custom event dispatched by UserIdentityDropdown
    function handleCustom(e: Event) {
      setCurrentUser((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('pid:userChanged', handleCustom)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('pid:userChanged', handleCustom)
    }
  }, [])

  // Load current bookmarks whenever we have insight data (to show filled icons)
  const refreshBookmarkedIds = useCallback(async () => {
    try {
      const resp = await fetch('/api/bookmarks?status=open')
      if (!resp.ok) return
      const data = await resp.json() as { bookmarks: Bookmark[] }
      setBookmarkedIds(new Set(data.bookmarks.map(b => b.insightId)))
    } catch {
      // Non-critical — ignore errors
    }
  }, [])

  useEffect(() => {
    if (phase === 'view') {
      refreshBookmarkedIds()
    }
  }, [phase, refreshBookmarkedIds])

  const handleToggleBookmark = useCallback(async (group: InsightGroup, userOverride?: string) => {
    // Clear previous bookmark errors
    setBookmarkError(null)

    const user = userOverride ?? currentUser

    // Require user identity — prompt inline instead of error
    if (!user) {
      setPendingBookmark(group)
      return
    }

    const isCurrentlyBookmarked = bookmarkedIds.has(group.id)

    // Mark as saving
    setSavingIds(prev => new Set(prev).add(group.id))

    try {
      if (isCurrentlyBookmarked) {
        // Find the bookmark and archive it
        const resp = await fetch(`/api/bookmarks?status=open`)
        if (!resp.ok) throw new Error('Failed to fetch bookmarks')
        const data = await resp.json() as { bookmarks: Bookmark[] }
        const existing = data.bookmarks.find(b => b.insightId === group.id)
        if (existing) {
          const patchResp = await fetch(`/api/bookmarks/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'archived' }),
          })
          if (!patchResp.ok) throw new Error('Failed to remove bookmark')
        }
        setBookmarkedIds(prev => {
          const next = new Set(prev)
          next.delete(group.id)
          return next
        })
      } else {
        // Create new bookmark
        const resp = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            insightId: group.id,
            insightHook: group.hook || group.representativeTicket.summary || group.id,
            insightCategory: group.category || 'Feedback',
            insightTemperature: group.temperature || 'Medium',
            teamName: group.teamName || 'Unknown',
            bookmarkedBy: user,
          }),
        })
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({})) as { error?: string; detail?: string }
          throw new Error(`[${resp.status}] ${errData.detail ?? errData.error ?? 'Failed to create bookmark'}`)
        }
        setBookmarkedIds(prev => new Set(prev).add(group.id))
      }
      setBookmarkRefreshKey(k => k + 1)
    } catch (err) {
      setBookmarkError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev)
        next.delete(group.id)
        return next
      })
    }
  }, [currentUser, bookmarkedIds])

  const fetchData = useCallback(async (teams: string[]) => {
    setLoading(true)
    setError(null)

    try {
      // Always fetch all teams from API and filter client-side for accurate multi-Jira-name mapping
      const teamParam = ''

      const [openResp, depResp] = await Promise.all([
        fetch(`/api/insights?status=parking_lot${teamParam}`),
        fetch(`/api/insights?status=wont_do${teamParam}`),
      ])

      if (!openResp.ok || !depResp.ok) {
        const errBody = await (!openResp.ok ? openResp : depResp).json().catch(() => ({}))
        throw new Error(errBody?.error || `API error ${(!openResp.ok ? openResp : depResp).status}`)
      }

      const [openJson, depJson]: [InsightData, InsightData] = await Promise.all([
        openResp.json(),
        depResp.json(),
      ])

      // If multiple teams selected, filter client-side
      const filterByTeams = (groups: InsightGroup[]): InsightGroup[] => {
        if (teams.length === 0) return groups
        // Build set of all Jira names for selected display names
        const jiraNameSet = new Set<string>()
        for (const selectedName of teams) {
          const team = TEAMS.find(t => t.name === selectedName)
          if (team) team.jiraNames.forEach(n => jiraNameSet.add(n))
        }
        return groups.filter(g => jiraNameSet.has(g.teamName ?? ''))
      }

      setOpenData({ groups: filterByTeams(openJson.groups) })
      setDeprioritizedData({ groups: filterByTeams(depJson.groups) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleApplyFilter = (teams: string[]) => {
    setSelectedTeams(teams)
    setPhase('view')
    fetchData(teams)
  }

  const handleSkip = () => {
    setSelectedTeams([])
    setPhase('view')
    fetchData([])
  }

  const handleChangeFilter = () => {
    setPhase('filter')
    setOpenData(null)
    setDeprioritizedData(null)
    setSelectedGroup(null)
  }

  // Current tab data
  const currentData = activeTab === 'open' ? openData : deprioritizedData
  const bugGroups = (currentData?.groups ?? [])
    .filter(g => g.category === 'Bug')
    .sort((a, b) => b.temperatureScore - a.temperatureScore)
  const feedbackGroups = (currentData?.groups ?? [])
    .filter(g => g.category === 'Feedback')
    .sort((a, b) => b.temperatureScore - a.temperatureScore)

  // ── Filter screen
  if (phase === 'filter') {
    return <TeamFilterScreen onApply={handleApplyFilter} onSkip={handleSkip} />
  }

  // ── Insights view
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Insights</h1>
          <p className="text-gray-400 text-sm">
            {selectedTeams.length > 0
              ? `Showing insights for: ${selectedTeams.join(', ')}`
              : 'Showing insights across all teams'}
          </p>
        </div>
        <button
          onClick={handleChangeFilter}
          className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-indigo-800 hover:border-indigo-600"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Change Filter
        </button>
      </div>

      {/* Bookmark error toast */}
      {bookmarkError && (
        <div className="bg-amber-900/20 border border-amber-700 rounded-xl p-3 flex items-center justify-between gap-3">
          <p className="text-amber-300 text-sm">{bookmarkError}</p>
          <button
            onClick={() => setBookmarkError(null)}
            className="text-amber-500 hover:text-amber-300 text-xs underline whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('open')}
          className={[
            'px-4 py-2 rounded-md text-sm font-semibold transition-all duration-150',
            activeTab === 'open'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-gray-400 hover:text-gray-200',
          ].join(' ')}
        >
          Open Insights
          {openData && (
            <span className={`ml-2 text-xs ${activeTab === 'open' ? 'text-indigo-200' : 'text-gray-600'}`}>
              {openData.groups.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('deprioritized')}
          className={[
            'px-4 py-2 rounded-md text-sm font-semibold transition-all duration-150',
            activeTab === 'deprioritized'
              ? 'bg-gray-600 text-white shadow'
              : 'text-gray-400 hover:text-gray-200',
          ].join(' ')}
        >
          Deprioritized
          {deprioritizedData && (
            <span className={`ml-2 text-xs ${activeTab === 'deprioritized' ? 'text-gray-300' : 'text-gray-600'}`}>
              {deprioritizedData.groups.length}
            </span>
          )}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-xl p-4">
          <p className="text-red-300 text-sm font-medium">Error loading insights</p>
          <p className="text-red-400 text-xs mt-1">{error}</p>
          <button
            onClick={() => fetchData(selectedTeams)}
            className="mt-2 text-xs text-red-300 underline hover:text-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && <LoadingSkeleton />}

      {/* Content */}
      {!loading && !error && currentData && (
        <div className="space-y-10">
          {/* Bugs section */}
          <CategorySection
            title="Bugs"
            groups={bugGroups}
            accentClass="bg-red-900/40 text-red-300"
            onSelectGroup={setSelectedGroup}
            bookmarkedIds={bookmarkedIds}
            savingIds={savingIds}
            onToggleBookmark={handleToggleBookmark}
          />

          {/* Feedback section */}
          <CategorySection
            title="Feedback"
            groups={feedbackGroups}
            accentClass="bg-blue-900/40 text-blue-300"
            onSelectGroup={setSelectedGroup}
            bookmarkedIds={bookmarkedIds}
            savingIds={savingIds}
            onToggleBookmark={handleToggleBookmark}
          />

          {/* Empty state */}
          {bugGroups.length === 0 && feedbackGroups.length === 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-12 text-center text-gray-500">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-sm">No insights found for this selection.</p>
              <button
                onClick={handleChangeFilter}
                className="mt-4 text-sm text-indigo-400 hover:text-indigo-300 underline"
              >
                Change team filter
              </button>
            </div>
          )}

          {/* Bookmarked Insights */}
          <BookmarkedInsightsSection
            selectedTeams={selectedTeams}
            refreshKey={bookmarkRefreshKey}
            allGroups={[...(openData?.groups ?? []), ...(deprioritizedData?.groups ?? [])]}
            onSelectGroup={setSelectedGroup}
          />
        </div>
      )}

      {/* Detail Panel */}
      {selectedGroup && (
        <DetailPanel
          group={selectedGroup}
          onClose={() => setSelectedGroup(null)}
          bookmarkedIds={bookmarkedIds}
          savingIds={savingIds}
          onToggleBookmark={handleToggleBookmark}
        />
      )}

      {/* Name-selection prompt — shown when user tries to bookmark without selecting name */}
      {pendingBookmark && (
        <NamePromptModal
          onSelect={(name) => {
            setCurrentUser(name)
            localStorage.setItem(STORAGE_KEY, name)
            window.dispatchEvent(new CustomEvent('pid:userChanged', { detail: name }))
            const group = pendingBookmark
            setPendingBookmark(null)
            handleToggleBookmark(group, name)
          }}
          onCancel={() => setPendingBookmark(null)}
        />
      )}
    </div>
  )
}
