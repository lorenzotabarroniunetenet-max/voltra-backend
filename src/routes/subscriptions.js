import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../lib/middleware.js'

const r = Router()

// ── MEMBER: stato abbonamento proprio ──
r.get('/me', requireAuth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: { in: ['ACTIVE', 'SUSPENDED'] } },
      orderBy: { endDate: 'desc' },
    })
    if (!sub) return res.json({ subscription: null })
    const now = new Date()
    const daysLeft = Math.ceil((new Date(sub.endDate) - now) / (1000 * 60 * 60 * 24))
    res.json({ subscription: { ...sub, daysLeft } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── ADMIN: lista tutti gli abbonamenti ──
r.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query
    const where = status ? { status } : {}
    const subs = await prisma.subscription.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, matricola: true, telegramChatId: true } } },
      orderBy: { endDate: 'asc' },
    })
    const now = new Date()
    const enriched = subs.map(s => ({
      ...s,
      daysLeft: Math.ceil((new Date(s.endDate) - now) / (1000 * 60 * 60 * 24)),
    }))
    res.json(enriched)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── ADMIN: crea abbonamento per membro ──
r.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId, months = 1, amount = 99, notes } = req.body
    if (!userId) return res.status(400).json({ error: 'userId richiesto' })
    const startDate = new Date()
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + Number(months))

    // Sospendi eventuali abbonamenti attivi esistenti
    await prisma.subscription.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'SUSPENDED' },
    })

    const sub = await prisma.subscription.create({
      data: { userId, startDate, endDate, amount, notes, status: 'ACTIVE' },
      include: { user: { select: { name: true, email: true, telegramChatId: true } } },
    })
    res.json(sub)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── ADMIN: rinnova abbonamento (estende endDate) ──
r.post('/:id/renew', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { months = 1 } = req.body
    const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } })
    if (!sub) return res.status(404).json({ error: 'Non trovato' })
    const base = new Date(sub.endDate) > new Date() ? new Date(sub.endDate) : new Date()
    const newEnd = new Date(base)
    newEnd.setMonth(newEnd.getMonth() + Number(months))
    const updated = await prisma.subscription.update({
      where: { id: req.params.id },
      data: { endDate: newEnd, status: 'ACTIVE' },
      include: { user: { select: { name: true, email: true } } },
    })
    res.json(updated)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── ADMIN: cambia stato ──
r.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body
    const updated = await prisma.subscription.update({
      where: { id: req.params.id },
      data: { ...(status && { status }), ...(notes !== undefined && { notes }) },
      include: { user: { select: { name: true, email: true } } },
    })
    res.json(updated)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── ADMIN: abbonamenti in scadenza (prossimi N giorni) ──
r.get('/expiring/:days', requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.params.days) || 7
    const from = new Date()
    const to = new Date(); to.setDate(to.getDate() + days)
    const subs = await prisma.subscription.findMany({
      where: { status: 'ACTIVE', endDate: { gte: from, lte: to } },
      include: { user: { select: { name: true, email: true, matricola: true, telegramChatId: true } } },
      orderBy: { endDate: 'asc' },
    })
    res.json(subs.map(s => ({ ...s, daysLeft: Math.ceil((new Date(s.endDate) - from) / 86400000) })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Membro: richiede pagamento abbonamento
r.post('/request-payment', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true, matricola: true, rank: true, telegramChatId: true },
    })
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.id },
      orderBy: { endDate: 'desc' },
    })

    // Notifica admin Telegram
    const { bot } = await import('../bot/index.js').catch(() => ({ bot: null }))
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID
    if (bot && adminChatId) {
      const endDate = sub?.endDate ? new Date(sub.endDate).toLocaleDateString('it-IT') : 'N/A'
      await bot.api.sendMessage(Number(adminChatId),
        `💳 <b>Richiesta pagamento abbonamento</b>\n\n` +
        `<b>${user?.name}</b> (${user?.matricola} · ${user?.rank})\n` +
        `Scadenza attuale: ${endDate}\n\n` +
        `Il membro vuole rinnovare l'abbonamento mensile <b>€99</b>.`,
        { parse_mode: 'HTML' }
      ).catch(e => console.warn('[sub] telegram failed:', e.message))
    }

    res.json({ ok: true })
  } catch (e) {
    console.error('[sub] request-payment error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

export default r
