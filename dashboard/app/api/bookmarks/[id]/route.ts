import { promises as fs } from 'fs'
import path from 'path'
import type { NextRequest } from 'next/server'
import type { Bookmark } from '../route'

export const dynamic = 'force-dynamic'

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
      // non-fatal
    }
    return
  }
  try {
    await fs.writeFile(LOCAL_FILE, JSON.stringify(bookmarks, null, 2), 'utf-8')
  } catch {
    // read-only filesystem on Vercel — no-op without Redis
  }
}

// PATCH /api/bookmarks/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status } = body as { status: 'open' | 'archived' }

    if (!status || !['open', 'archived'].includes(status)) {
      return Response.json({ error: 'Invalid status value' }, { status: 400 })
    }

    const bookmarks = await readBookmarks()
    const index = bookmarks.findIndex(b => b.id === id)

    if (index === -1) {
      return Response.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    bookmarks[index] = { ...bookmarks[index], status }
    await writeBookmarks(bookmarks)

    return Response.json({ bookmark: bookmarks[index] })
  } catch (error) {
    console.error('[PATCH /api/bookmarks/[id]]', error)
    return Response.json({ error: 'Failed to update bookmark' }, { status: 500 })
  }
}
