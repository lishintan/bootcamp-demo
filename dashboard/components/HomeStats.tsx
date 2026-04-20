'use client'

import { useEffect, useState } from 'react'

interface Stats {
  parkingLot: number
  wontDo: number
  total: number
}

export default function HomeStats() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then((data: Stats) => setStats(data))
      .catch(() => {})
  }, [])

  if (!stats) {
    return (
      <div className="flex gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-gray-700 rounded-lg px-3 py-2 text-center animate-pulse w-20">
            <div className="h-6 bg-gray-600 rounded mb-1" />
            <div className="h-3 bg-gray-600 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-4">
      <div className="bg-gray-700 rounded-lg px-3 py-2 text-center">
        <div className="text-lg font-bold text-white">{stats.parkingLot}</div>
        <div className="text-xs text-gray-400">Parking Lot</div>
      </div>
      <div className="bg-gray-700 rounded-lg px-3 py-2 text-center">
        <div className="text-lg font-bold text-white">{stats.wontDo}</div>
        <div className="text-xs text-gray-400">Won&apos;t Do</div>
      </div>
      <div className="bg-indigo-900/40 rounded-lg px-3 py-2 text-center">
        <div className="text-lg font-bold text-indigo-300">{stats.total}</div>
        <div className="text-xs text-indigo-400">Total tickets</div>
      </div>
    </div>
  )
}
