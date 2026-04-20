import { fetchProductUsers } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const users = await fetchProductUsers()
    return Response.json({ success: true, users, count: users.length })
  } catch (error) {
    console.error('[API /api/users] Error:', error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
