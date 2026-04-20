import { promises as fs } from 'fs'
import path from 'path'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export interface Bookmark {
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

// ─── Storage: Upstash Redis (prod) or local JSON (dev) ────────────────────────

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const REDIS_KEY = 'pid-bookmarks'
const LOCAL_FILE = path.join(process.cwd(), 'data', 'bookmarks.json')

async function readBookmarks(): Promise<Bookmark[]> {
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const res = await fetch(`${REDIS_URL}/get/${REDIS_KEY}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
        cache: 'no-store',
      })
      if (!res.ok) return []
      const json = await res.json() as { result: string | null }
      if (!json.result) return []
      return JSON.parse(json.result) as Bookmark[]
    } catch {
      return []
    }
  }
  try {
    const content = await fs.readFile(LOCAL_FILE, 'utf-8')
    return JSON.parse(content) as Bookmark[]
  } catch {
    return []
  }
}

async function writeBookmarks(bookmarks: Bookmark[]): Promise<void> {
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      await fetch(`${REDIS_URL}/set/${REDIS_KEY}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${REDIS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(bookmarks)),
      })
    } catch {
      // non-fatal — bookmark saved in memory until next cold start
    }
    return
  }
  try {
    await fs.writeFile(LOCAL_FILE, JSON.stringify(bookmarks, null, 2), 'utf-8')
  } catch {
    // read-only filesystem on Vercel — no-op without Redis
  }
}

// GET /api/bookmarks?team=<team>&status=open|archived
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const teamFilter = searchParams.get('team')
    const statusFilter = searchParams.get('status') as 'open' | 'archived' | null

    let bookmarks = await readBookmarks()

    if (statusFilter) {
      bookmarks = bookmarks.filter(b => b.status === statusFilter)
    }
    if (teamFilter && teamFilter !== 'All Teams') {
      bookmarks = bookmarks.filter(b => b.teamName === teamFilter)
    }

    return Response.json({ bookmarks })
  } catch (error) {
    console.error('[GET /api/bookmarks]', error)
    return Response.json({ error: 'Failed to load bookmarks' }, { status: 500 })
  }
}

// POST /api/bookmarks
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { insightId, insightHook, insightCategory, insightTemperature, teamName, bookmarkedBy } = body

    if (!insightId || !insightHook || !insightCategory || !insightTemperature || !bookmarkedBy) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const bookmarks = await readBookmarks()

    const existing = bookmarks.find(
      b => b.insightId === insightId && b.teamName === teamName && b.status === 'open',
    )
    if (existing) {
      return Response.json({ bookmark: existing, duplicate: true })
    }

    const newBookmark: Bookmark = {
      id: crypto.randomUUID(),
      insightId,
      insightHook,
      insightCategory,
      insightTemperature,
      teamName,
      bookmarkedBy,
      bookmarkedAt: new Date().toISOString(),
      status: 'open',
    }

    bookmarks.push(newBookmark)
    await writeBookmarks(bookmarks)

    return Response.json({ bookmark: newBookmark }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/bookmarks]', error)
    return Response.json({ error: 'Failed to save bookmark' }, { status: 500 })
  }
}
