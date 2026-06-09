import postgres from 'postgres'

let _sql: ReturnType<typeof postgres> | null = null

export function getDb() {
  if (!_sql) {
    const rawUrl = process.env.DATABASE_URL
    if (!rawUrl) throw new Error('DATABASE_URL is not set')

    // libpq supports ?host= to specify a unix socket directory.
    // Extract it before passing to postgres.js, which ignores it.
    const parsed = new URL(rawUrl)
    const socketHost = parsed.searchParams.get('host') ?? undefined
    parsed.searchParams.delete('host')

    _sql = postgres(parsed.toString(), {
      ...(socketHost ? { host: socketHost } : {}),
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: postgres.camel,
    })
  }
  return _sql
}

export type Sql = ReturnType<typeof getDb>
