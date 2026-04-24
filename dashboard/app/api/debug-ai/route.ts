export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  const envCheck = {
    GEMINI_API_KEY: apiKey ? `set (${apiKey.slice(0, 8)}...)` : 'MISSING',
    UPSTASH_REDIS_REST_URL: redisUrl ? 'set' : 'MISSING',
    UPSTASH_REDIS_REST_TOKEN: redisToken ? 'set' : 'MISSING',
  }

  if (!apiKey) {
    return Response.json({ envCheck, apiTest: 'skipped — no API key' })
  }

  // Make a minimal real API call to verify the key works
  let apiTest: Record<string, unknown>
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with just the word: working' }] }],
          generationConfig: { maxOutputTokens: 20 },
        }),
      },
    )
    const status = resp.status
    const data = await resp.json() as Record<string, unknown>
    if (resp.ok) {
      const content = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
        .candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      apiTest = { status, ok: true, response: content }
    } else {
      apiTest = { status, ok: false, error: data }
    }
  } catch (err) {
    apiTest = { ok: false, error: String(err) }
  }

  // Check what's in Redis cache
  let redisCheck: Record<string, unknown> = { skipped: 'no redis config' }
  if (redisUrl && redisToken) {
    try {
      const keys = await fetch(`${redisUrl}/keys/pid-*`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        cache: 'no-store',
      })
      const keysData = await keys.json() as { result?: string[] }
      redisCheck = { keys: keysData.result ?? [] }
    } catch (err) {
      redisCheck = { error: String(err) }
    }
  }

  return Response.json({ envCheck, apiTest, redisCheck })
}
