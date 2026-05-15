import postgres from 'postgres'

let _sql: ReturnType<typeof postgres> | null = null

export function getDb() {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: postgres.camel, // auto snake_case → camelCase on reads
    })
  }
  return _sql
}

export type Sql = ReturnType<typeof getDb>
