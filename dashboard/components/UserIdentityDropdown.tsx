'use client'

import { useEffect, useState } from 'react'

interface User {
  id: string
  preferredName: string
  division: string
}

const STORAGE_KEY = 'pid_selected_user'

export default function UserIdentityDropdown() {
  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Restore selection from localStorage
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setSelected(saved)

    // Fetch users from API
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setUsers(data.users)
        } else {
          setError(data.error || 'Failed to load users')
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    setSelected(val)
    if (val) {
      localStorage.setItem(STORAGE_KEY, val)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    // Notify same-tab listeners (storage event only fires in other tabs)
    window.dispatchEvent(new CustomEvent('pid:userChanged', { detail: val }))
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-400 whitespace-nowrap">Viewing as:</span>
      <div className="relative">
        {loading ? (
          <div className="h-9 w-48 bg-gray-700 rounded-lg animate-pulse" />
        ) : error ? (
          <span className="text-xs text-red-400">Could not load users</span>
        ) : (
          <select
            value={selected}
            onChange={handleChange}
            className="appearance-none bg-gray-700 text-white text-sm rounded-lg px-3 py-2 pr-8 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer min-w-[180px]"
          >
            <option value="">Select your name…</option>
            {users.map(u => (
              <option key={u.id} value={u.preferredName}>
                {u.preferredName}
              </option>
            ))}
          </select>
        )}
        {!loading && !error && (
          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 20 20" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 8l4 4 4-4" />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
