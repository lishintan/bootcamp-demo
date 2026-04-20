import { fetchCustomerResearch } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await fetchCustomerResearch()
    return Response.json({
      success: true,
      total: result.total,
      source: result.source,
      records: result.records,
    })
  } catch (error) {
    console.error('[API /api/customers] Error:', error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
