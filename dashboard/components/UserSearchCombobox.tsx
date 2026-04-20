'use client'

import { useState, useRef, useEffect } from 'react'

interface User {
  id: string
  preferredName: string
}

interface Props {
  users: User[]
  value: string
  onChange: (name: string) => void
  placeholder?: string
  inputClassName?: string
}

export default function UserSearchCombobox({
  users,
  value,
  onChange,
  placeholder = 'Search your name…',
  inputClassName,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = query.trim()
    ? users.filter(u => u.preferredName.toLowerCase().includes(query.toLowerCase()))
    : users

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  function handleSelect(name: string) {
    onChange(name)
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleFocus() {
    setQuery(value)
    setOpen(true)
    setActiveIndex(-1)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setOpen(true)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) { setOpen(true); return }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && filtered[activeIndex]) {
          handleSelect(filtered[activeIndex].preferredName)
        } else if (filtered.length === 1) {
          handleSelect(filtered[0].preferredName)
        }
        break
      case 'Escape':
        setOpen(false)
        setQuery('')
        setActiveIndex(-1)
        break
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={open ? query : value}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={value || placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 top-full mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-52 overflow-y-auto"
        >
          {filtered.map((u, i) => (
            <li
              key={u.id}
              onMouseDown={e => { e.preventDefault(); handleSelect(u.preferredName) }}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                i === activeIndex
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-200 hover:bg-gray-700'
              }`}
            >
              {u.preferredName}
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-xl px-3 py-2 text-sm text-gray-500">
          No match for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  )
}
