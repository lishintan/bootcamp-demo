export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const testSummary = 'A 35-year-old software engineer and parent of two children. Uses the mobile app daily for meditation and personal growth. Tech savvy, prefers iPhone.'

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Extract attributes from this profile:\n\n[1] ${testSummary}\n\nReturn a JSON array of exactly 1 object:\n- age: "20s"|"30s"|"40s"|"50s"|"60s"|"70s+"|"Unknown"\n- lifeStage: "Parent"|"Student"|"Retired"|"Single"|"Entrepreneur"|"Professional"\n- job: "Coach"|"Entrepreneur"|"Educator"|"Healthcare"|"Tech"|"Corporate"|"Creative"|"Other"\n- motivation: "Personal Growth"|"Wellness"|"Learning"|"Spirituality"|"Career"|"Other"\n- techLiteracy: "Low"|"Medium"|"High"\n- device: "Mobile"|"Desktop"|"Tablet"|"Multi-device"\n\nJSON array only: [{"age":"...","lifeStage":"...","job":"...","motivation":"...","techLiteracy":"...","device":"..."}]`,
        }],
      }),
    })
    const status = resp.status
    const body = await resp.json()
    return Response.json({ status, apiKeyPresent: true, apiKeyPrefix: apiKey.slice(0, 10) + '...', body })
  } catch (e) {
    return Response.json({ error: String(e), apiKeyPresent: true })
  }
}
