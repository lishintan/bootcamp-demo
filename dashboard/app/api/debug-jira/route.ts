export const dynamic = 'force-dynamic'

export async function GET() {
  const baseUrl = process.env.JIRA_BASE_URL!
  const email = process.env.JIRA_USER_EMAIL!
  const token = process.env.JIRA_API_TOKEN!
  const auth = Buffer.from(`${email}:${token}`).toString('base64')

  const url = new URL(`${baseUrl}/rest/api/3/search/jql`)
  url.searchParams.set('jql', `project=PF AND status in ("Parking Lot","Won't Do") ORDER BY created ASC`)
  url.searchParams.set('maxResults', '3')
  url.searchParams.set('fields', 'summary,status,created')

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    cache: 'no-store',
  })

  const data = await resp.json() as Record<string, unknown>

  // Return raw issue objects (top-level keys only, not fields) to see archive flags
  const issues = (data.issues as Record<string, unknown>[] ?? []).map(issue => {
    const { fields, ...topLevel } = issue as { fields: unknown } & Record<string, unknown>
    return { topLevel, fieldKeys: Object.keys(fields as Record<string, unknown> ?? {}).filter(k => k.toLowerCase().includes('arch')) }
  })

  return Response.json({ status: resp.status, issues })
}
