import staticUsers from '@/data/product-creatives-users.json'
import staticCustomerSessions from '@/data/customer-sessions.json'

export interface AirtableUser {
  id: string
  preferredName: string
  division: string
}

export interface AirtableCustomerRecord {
  id: string
  fields: Record<string, unknown>
}

interface AirtableListResponse {
  records: AirtableRecord[]
  offset?: string
}

interface AirtableRecord {
  id: string
  fields: Record<string, unknown>
  createdTime?: string
}

function getAirtableHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
    Accept: 'application/json',
  }
}

// Known field IDs in the Researchers table (discovered via MCP inspection)
// Preferred Name: fldklPfmxqs98WdPH
// Import: Division: fld4zZ1i4gXjz4ntM
const USER_FIELDS = [
  'fldklPfmxqs98WdPH', // Preferred Name
  'fld4zZ1i4gXjz4ntM', // Import: Division
]

export async function fetchProductUsers(): Promise<AirtableUser[]> {
  // Try the live Airtable API first
  try {
    const baseId = process.env.AIRTABLE_BASE_ID!
    const tableId = process.env.AIRTABLE_USER_TABLE_ID!

    // Filter Division contains "Product & Creatives" using field ID
    const formula = encodeURIComponent(`FIND("Product & Creatives", {fld4zZ1i4gXjz4ntM})`)
    const fieldParams = USER_FIELDS.map(f => `fields[]=${encodeURIComponent(f)}`).join('&')

    const allUsers: AirtableUser[] = []
    let offset: string | undefined

    do {
      let url = `https://api.airtable.com/v0/${baseId}/${tableId}?filterByFormula=${formula}&${fieldParams}&pageSize=100`
      if (offset) {
        url += `&offset=${offset}`
      }

      const resp = await fetch(url, {
        headers: getAirtableHeaders(),
        cache: 'no-store',
      })

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ error: resp.statusText }))
        // Degrade gracefully to static user data on ANY non-OK response
        // (401 bad/expired token, 403 no access, 404 wrong id, 429/5xx transient).
        console.log(
          `[Airtable] Live user API unavailable (HTTP ${resp.status}` +
            `${errorData?.error?.type ? `, ${errorData.error.type}` : ''}) — using static user data`
        )
        return getStaticUsers()
      }

      const data: AirtableListResponse = await resp.json()
      offset = data.offset

      for (const record of data.records) {
        const name = record.fields['fldklPfmxqs98WdPH'] || record.fields['Preferred Name']
        const division = record.fields['fld4zZ1i4gXjz4ntM'] || record.fields['Import: Division']

        if (name && typeof name === 'string' && name.trim()) {
          const divStr = typeof division === 'string' ? division : ''
          if (divStr.includes('Product & Creatives')) {
            allUsers.push({
              id: record.id,
              preferredName: name.trim(),
              division: divStr,
            })
          }
        }
      }
    } while (offset)

    if (allUsers.length > 0) {
      allUsers.sort((a, b) => a.preferredName.localeCompare(b.preferredName))
      return allUsers
    }

    // If no users returned (possibly empty filter result), fall back to static
    console.log('[Airtable] No users returned from live API, using static user data')
    return getStaticUsers()
  } catch (err) {
    console.log('[Airtable] Error fetching users from live API, using static data:', err)
    return getStaticUsers()
  }
}

function getStaticUsers(): AirtableUser[] {
  const users = (staticUsers as AirtableUser[]).sort((a, b) =>
    a.preferredName.localeCompare(b.preferredName)
  )
  return users
}

export async function fetchCustomerResearch(): Promise<{ records: AirtableCustomerRecord[]; total: number; source: string }> {
  const baseId = process.env.AIRTABLE_BASE_ID!
  const tableId = process.env.AIRTABLE_CUSTOMER_TABLE_ID!
  const viewId = process.env.AIRTABLE_CUSTOMER_VIEW_ID!

  const allRecords: AirtableCustomerRecord[] = []
  let offset: string | undefined
  let source = 'live'

  try {
    do {
      let url = `https://api.airtable.com/v0/${baseId}/${tableId}?view=${viewId}&pageSize=100`
      if (offset) {
        url += `&offset=${offset}`
      }

      const resp = await fetch(url, {
        headers: getAirtableHeaders(),
        cache: 'no-store',
      })

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}))
        // Degrade gracefully to the static snapshot on ANY non-OK response so
        // the page always renders instead of showing zero customers:
        //   401 → bad/expired token, 403 → token lacks base access,
        //   404 → wrong base/table/view id, 429/5xx → transient upstream error.
        console.log(
          `[Airtable] Customer research unavailable (HTTP ${resp.status}` +
            `${errorData?.error?.type ? `, ${errorData.error.type}` : ''}) — using static fallback`
        )
        return getStaticCustomerSessions()
      }

      const data: AirtableListResponse = await resp.json()
      offset = data.offset

      for (const record of data.records) {
        allRecords.push({
          id: record.id,
          fields: record.fields,
        })
      }
    } while (offset)
  } catch (err) {
    console.error('[Airtable] Error fetching customer research, using static fallback:', err)
    return getStaticCustomerSessions()
  }

  return { records: allRecords, total: allRecords.length, source }
}

function getStaticCustomerSessions(): { records: AirtableCustomerRecord[]; total: number; source: string } {
  const records = (staticCustomerSessions as unknown as AirtableCustomerRecord[])
  return { records, total: 363, source: 'static' }
}
