import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../lib/middleware.js'

const r = Router()

// ── GET /api/crypto/prices — prezzi live da CoinGecko ──
let priceCache = null
let priceCacheAt = 0

r.get('/prices', async (req, res) => {
  try {
    const now = Date.now()
    if (priceCache && now - priceCacheAt < 30000) {
      return res.json(priceCache)
    }
    const resp = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,usd-coin&vs_currencies=eur',
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) }
    )
    if (!resp.ok) throw new Error('CoinGecko error')
    const data = await resp.json()
    priceCache = {
      BTC:  data.bitcoin?.eur   || 88000,
      ETH:  data.ethereum?.eur  || 2800,
      USDT: data.tether?.eur    || 0.93,
      USDC: data['usd-coin']?.eur || 0.93,
    }
    priceCacheAt = now
    res.json(priceCache)
  } catch (e) {
    res.json(priceCache || { BTC: 88000, ETH: 2800, USDT: 0.93, USDC: 0.93 })
  }
})

// ── MARGIN REQUESTS ──

// Admin: crea richiesta margine
r.post('/margin/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { amount = 350, note } = req.body
    // Revoca eventuali richieste pending precedenti
    await prisma.marginRequest.updateMany({
      where: { userId: req.params.userId, status: 'PENDING' },
      data: { status: 'REVOKED' }
    })
    const margin = await prisma.marginRequest.create({
      data: { userId: req.params.userId, amount, currency: 'EUR', note: note || null }
    })
    res.json(margin)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Admin: revoca richiesta margine
r.delete('/margin/:userId', requireAuth, requireAdmin, async (req, res) => {
  await prisma.marginRequest.updateMany({
    where: { userId: req.params.userId, status: 'PENDING' },
    data: { status: 'REVOKED' }
  })
  res.json({ ok: true })
})

// Admin: get stato margine utente
r.get('/margin/:userId', requireAuth, requireAdmin, async (req, res) => {
  const margin = await prisma.marginRequest.findFirst({
    where: { userId: req.params.userId },
    orderBy: { createdAt: 'desc' }
  })
  res.json(margin || null)
})

// Membro: vedi richiesta attiva
r.patch('/margin/:userId/paid', requireAuth, requireAdmin, async (req, res) => {
  await prisma.marginRequest.updateMany({
    where: { userId: req.params.userId, status: 'PENDING' },
    data: { status: 'PAID', paidAt: new Date() },
  })
  res.json({ ok: true })
})

r.get('/margin/me/active', requireAuth, async (req, res) => {
  const margin = await prisma.marginRequest.findFirst({
    where: { userId: req.user.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' }
  })
  res.json(margin || null)
})

// Membro: conferma pagamento margine
r.post('/margin/me/pay', requireAuth, async (req, res) => {
  const { txHash, network, cryptoAmount, cryptoCoin } = req.body
  const margin = await prisma.marginRequest.findFirst({
    where: { userId: req.user.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' }
  })
  if (!margin) return res.status(404).json({ error: 'Nessuna richiesta attiva' })

  await prisma.marginRequest.update({
    where: { id: margin.id },
    data: { status: 'PAID', paidAt: new Date(), note: `TX: ${txHash} · ${cryptoAmount} ${cryptoCoin} · ${network}` }
  })

  // Notifica admin Telegram
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, matricola: true } })
    const { bot } = await import('../bot/index.js').catch(() => ({ bot: null }))
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID
    if (bot && adminChatId) {
      await bot.api.sendMessage(Number(adminChatId),
        `💰 <b>Margine pagato</b>\n\n${user?.name} (${user?.matricola}) ha confermato il pagamento del margine aggiuntivo €${margin.amount}\n\nTX: <code>${txHash}</code>\nRete: ${network}\nImporto: ${cryptoAmount} ${cryptoCoin}`,
        { parse_mode: 'HTML' }
      )
    }
  } catch (_) {}

  res.json({ ok: true })
})

export default r
