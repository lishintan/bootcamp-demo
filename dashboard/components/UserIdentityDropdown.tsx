'use client'

import { useEffect, useState } from 'react'
import UserSearchCombobox from './UserSearchCombobox'

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
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setSelected(saved)

    function handleCustom(e: Event) {
      setSelected((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('pid:userChanged', handleCustom)

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

    return () => window.removeEventListener('pid:userChanged', handleCustom)
  }, [])

  function handleChange(name: string) {
    setSelected(name)
    if (name) {
      localStorage.setItem(STORAGE_KEY, name)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    window.dispatchEvent(new CustomEvent('pid:userChanged', { detail: name }))
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-400 whitespace-nowrap">Viewing as:</span>
      <div className="relative min-w-[180px]">
        {loading ? (
          <div className="h-9 w-48 bg-gray-700 rounded-lg animate-pulse" />
        ) : error ? (
          <span className="text-xs text-red-400">Could not load users</span>
        ) : (
          <UserSearchCombobox
            users={users}
            value={selected}
            onChange={handleChange}
            placeholder="Select your name…"
            inputClassName="w-full appearance-none bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer"
          />
        )}
      </div>
    </div>
  )
}
