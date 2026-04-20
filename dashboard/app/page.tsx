export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { fetchJiraTickets, pickBestQuote } from '@/lib/jira'

async function getJiraData() {
  try {
    const result = await fetchJiraTickets()
    return { tickets: result.tickets, total: result.total, error: null }
  } catch (err) {
    console.error('[Home] Jira fetch error:', err)
    return { tickets: [], total: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export default async function HomePage() {
  const { tickets, total, error } = await getJiraData()
  const quote = tickets.length > 0 ? pickBestQuote(tickets) : null

  const parkingLotCount = tickets.filter(t => t.status.toLowerCase() === 'parking lot').length
  const wontDoCount = tickets.filter(t => t.status.toLowerCase() === "won't do").length

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Product Intelligence Dashboard</h1>
        <p className="text-gray-400 text-base">
          Real-time insights from product feedback, surfaced for the Product &amp; Creatives team.
        </p>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/insights" className="group">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 hover:border-indigo-500 transition-all duration-200 cursor-pointer h-full">
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center group-hover:bg-indigo-500 transition-colors">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <svg className="w-5 h-5 text-gray-500 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-white mb-2">Insights</h2>
            <p className="text-gray-400 text-sm mb-6">
              Browse semantically clustered product feedback — bugs and feature requests grouped by theme, ranked by temperature.
            </p>

            {/* Ticket count stats */}
            <div className="flex gap-4">
              <div className="bg-gray-700 rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-white">{parkingLotCount}</div>
                <div className="text-xs text-gray-400">Parking Lot</div>
              </div>
              <div className="bg-gray-700 rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-white">{wontDoCount}</div>
                <div className="text-xs text-gray-400">Won&apos;t Do</div>
              </div>
              <div className="bg-indigo-900/40 rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-indigo-300">{total}</div>
                <div className="text-xs text-indigo-400">Total tickets</div>
              </div>
            </div>

            {error && (
              <p className="mt-3 text-xs text-red-400">Data load error — check API connection</p>
            )}
          </div>
        </Link>

        <Link href="/customers" className="group">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 hover:border-emerald-500 transition-all duration-200 cursor-pointer h-full">
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center group-hover:bg-emerald-500 transition-colors">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <svg className="w-5 h-5 text-gray-500 group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-white mb-2">Who Are Our Customers</h2>
            <p className="text-gray-400 text-sm mb-6">
              Explore demographic profiles across age, life stage, profession, motivations, and device preferences from Airtable research data.
            </p>

            <div className="flex gap-4">
              <div className="bg-emerald-900/40 rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-emerald-300">2</div>
                <div className="text-xs text-emerald-400">Segments</div>
              </div>
              <div className="bg-gray-700 rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-white">7</div>
                <div className="text-xs text-gray-400">Attributes</div>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* User Quote */}
      {quote && (
        <div className="bg-gray-800 border-l-4 border-indigo-500 rounded-r-xl p-6">
          <div className="flex items-start gap-4">
            <svg className="w-8 h-8 text-indigo-400 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
            </svg>
            <div>
              <p className="text-gray-200 text-base italic leading-relaxed">{quote}</p>
              <p className="text-gray-500 text-sm mt-3">— From the Jira Product Feedback board</p>
            </div>
          </div>
        </div>
      )}

      {!quote && tickets.length === 0 && !error && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center text-gray-500 text-sm">
          Loading feedback data…
        </div>
      )}

      {/* Status footer */}
      <div className="text-xs text-gray-600 text-center">
        Data loaded from Jira and Airtable on each page request &bull; Sprint 1
      </div>
    </div>
  )
}
