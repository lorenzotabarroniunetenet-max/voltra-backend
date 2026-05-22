const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const TIMEOUT_MS = 15000

const CLASSIFIER_SYSTEM = `Sei "la Cifratrice del Comando", assistente AI del club privato Voltra, a tema militare.
Riceverai il messaggio di un membro. DEVI rispondere SOLO con un JSON valido del tipo:
{"category":"GENERIC"|"OPERATIVE","reply":"","summary":""}

Regole:
- "GENERIC": domanda generale (FAQ, come funziona il pool, cos'è il rimborso, regolamento, accesso). "reply" contiene la risposta da inviare al membro (max 400 caratteri, tono militare cortese, italiano). "summary" vuoto.
- "OPERATIVE": problema operativo (problema pagamento, missione bloccata, errore tecnico, rimborso non ricevuto). "reply" vuoto, "summary" riassunto in italiano max 200 caratteri da inoltrare al Comando.
- Se incerto scegli OPERATIVE.
- SOLO JSON puro, niente testo prima/dopo, niente backtick.`

export async function generateOdG(keywords) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(CLAUDE_ENDPOINT, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: `Sei il Comando del club privato militare italiano "Voltra". Scrivi un Ordine del Giorno ufficiale breve (max 180 parole) in italiano, tono militare austero e rispettoso, in prima persona plurale del Comando. Struttura: titolo "📋 ORDINE DEL GIORNO — VOLTRA COMANDO", corpo con 2-3 paragrafi, chiusura "Silentio agimus. — Il Comando Voltra". Niente prezzi, niente riferimenti tecnici al trading. Solo comunicazione operativa del club.`,
        messages: [{ role: 'user', content: `Genera un OdG basato su: ${keywords}` }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data?.content?.[0]?.text || '').trim() || null
  } catch { return null } finally { clearTimeout(timer) }
}

export async function personalizeEmail(template, memberContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(CLAUDE_ENDPOINT, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: `Sei il Comando del club privato "Voltra". Scrivi UN SOLO paragrafo di apertura personalizzato (2-3 frasi, max 60 parole) per un'email al membro. Tono militare rispettoso, usa il nome del membro, fai riferimento alla sua storia nel club se disponibile. Niente prezzi. Solo il paragrafo, niente altro.`,
        messages: [{ role: 'user', content: JSON.stringify(memberContext) }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data?.content?.[0]?.text || '').trim() || null
  } catch { return null } finally { clearTimeout(timer) }
}

export async function callClaude(userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[claude] ANTHROPIC_API_KEY missing')
    return null
  }
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(CLAUDE_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        system: CLASSIFIER_SYSTEM,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.warn(`[claude] HTTP ${res.status}: ${err.slice(0, 200)}`)
      return null
    }
    const data = await res.json()
    const text = (data?.content?.[0]?.text || '').trim()
    let parsed
    try { parsed = JSON.parse(text) } catch {
      const m = text.match(/\{[\s\S]*\}/)
      try { parsed = m ? JSON.parse(m[0]) : null } catch { parsed = null }
    }
    if (!parsed || !['GENERIC', 'OPERATIVE'].includes(parsed.category)) {
      console.warn(`[claude] invalid response: ${text.slice(0, 200)}`)
      return null
    }
    return parsed
  } catch (e) {
    console.warn(`[claude] call failed: ${e.message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}
