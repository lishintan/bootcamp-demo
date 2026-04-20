import Link from 'next/link'
import HomeStats from '@/components/HomeStats'

export default function HomePage() {
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

            <HomeStats />
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

      {/* Status footer */}
      <div className="text-xs text-gray-600 text-center">
        Data loaded from Jira and Airtable &bull; Product Intelligence Dashboard
      </div>
    </div>
  )
}
