import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../lib/middleware.js'
import { getAllSettings, setSetting } from '../lib/settings.js'

const r = Router()
r.use(requireAuth, requireAdmin)

// ── Settings ──
r.get('/settings', async (req, res) => res.json(await getAllSettings()))

r.put('/settings/:key', async (req, res) => {
  try {
    const { value, isPublic } = z.object({ value: z.string(), isPublic: z.boolean().optional() }).parse(req.body)
    res.json(await setSetting(req.params.key, value, isPublic ?? false))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/settings/bulk', async (req, res) => {
  try {
    const items = z.array(z.object({ key: z.string(), value: z.string(), isPublic: z.boolean().optional() })).parse(req.body)
    for (const it of items) await setSetting(it.key, it.value, it.isPublic ?? false)
    res.json({ ok: true, count: items.length })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Programs ──
r.get('/programs', async (req, res) => {
  const programs = await prisma.program.findMany({ orderBy: { accountSize: 'asc' } })
  res.json(programs)
})

r.post('/programs', async (req, res) => {
  try {
    const data = z.object({
      name: z.string(),
      accountSize: z.number().positive(),
      phase: z.enum(['CHALLENGE', 'VERIFICATION', 'FUNDED', 'INSTANT']),
      profitTargetPct: z.number().optional().nullable(),
      maxDailyLossPct: z.number().positive(),
      maxOverallLossPct: z.number().positive(),
      minTradingDays: z.number().int().optional().nullable(),
      profitSplitPct: z.number().positive(),
      payoutFrequencyDays: z.number().int().default(7).optional(),
      scalpingAllowed: z.boolean().optional(),
      newsAllowed: z.boolean().optional(),
      weekendHoldAllowed: z.boolean().optional(),
      priceUsd: z.number().optional().nullable(),
      activationFeeUsd: z.number().optional().nullable(),
      active: z.boolean().optional(),
    }).parse(req.body)
    res.json(await prisma.program.create({ data }))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.patch('/programs/:id', async (req, res) => {
  try {
    res.json(await prisma.program.update({ where: { id: req.params.id }, data: req.body }))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/programs/:id', async (req, res) => {
  try {
    await prisma.program.update({ where: { id: req.params.id }, data: { active: false } })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Accounts ──
r.get('/accounts', async (req, res) => {
  const accounts = await prisma.propAccount.findMany({
    include: { user: { select: { id: true, name: true, email: true } }, program: true },
    orderBy: { startedAt: 'desc' },
  })
  res.json(accounts)
})

r.post('/accounts', async (req, res) => {
  try {
    const data = z.object({
      userId: z.string(),
      programId: z.string(),
      brokerLogin: z.string(),
      broker: z.string().default('cTrader'),
      startBalance: z.number().positive(),
    }).parse(req.body)
    const account = await prisma.propAccount.create({ data })
    await prisma.auditLog.create({
      data: { actorId: req.user.id, entity: 'PropAccount', entityId: account.id, action: 'CREATE', after: account },
    })
    res.json(account)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.patch('/accounts/:id', async (req, res) => {
  try {
    const data = z.object({
      status: z.enum(['ACTIVE', 'PASSED', 'FAILED', 'PAID_OUT']).optional(),
      failureReason: z.string().optional().nullable(),
      endedAt: z.coerce.date().optional().nullable(),
      startBalance: z.number().positive().optional(),
      programId: z.string().optional(),
      brokerLogin: z.string().optional(),
      broker: z.string().optional(),
      notes: z.string().optional().nullable(),
    }).parse(req.body)
    const before = await prisma.propAccount.findUnique({ where: { id: req.params.id } })
    const account = await prisma.propAccount.update({ where: { id: req.params.id }, data })
    await prisma.auditLog.create({
      data: { actorId: req.user.id, entity: 'PropAccount', entityId: account.id, action: 'UPDATE', before, after: account },
    })
    res.json(account)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/accounts/:id', async (req, res) => {
  try {
    await prisma.propAccount.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Snapshots ──
r.post('/snapshots', async (req, res) => {
  try {
    const SnapshotSchema = z.object({
      accountId: z.string(),
      date: z.coerce.date(),
      balance: z.number().positive(),
      equity: z.number().positive(),
      trades: z.number().int().nonnegative().optional().nullable(),
      volume: z.number().nonnegative().optional().nullable(),
      bestTrade: z.number().optional().nullable(),
      worstTrade: z.number().optional().nullable(),
      avgWin: z.number().optional().nullable(),
      avgLoss: z.number().optional().nullable(),
      winRatePct: z.number().min(0).max(100).optional().nullable(),
      profitFactor: z.number().nonnegative().optional().nullable(),
      notes: z.string().optional().nullable(),
    })
    const items = Array.isArray(req.body) ? req.body : [req.body]
    const results = []
    for (const item of items) {
      const data = SnapshotSchema.parse(item)
      const account = await prisma.propAccount.findUnique({
        where: { id: data.accountId },
        include: { snapshots: { orderBy: { date: 'desc' }, take: 1 } },
      })
      if (!account) continue
      const startBalance = Number(account.startBalance)
      const prev = account.snapshots[0]
      const prevBalance = prev ? Number(prev.balance) : startBalance
      const dailyPL = data.balance - prevBalance
      const drawdownPct = ((startBalance - data.equity) / startBalance) * 100

      // Remove null/undefined to avoid Prisma issues
      const clean = {}
      for (const k of Object.keys(data)) {
        if (data[k] !== null && data[k] !== undefined) clean[k] = data[k]
      }

      const snapshot = await prisma.dailySnapshot.upsert({
        where: { accountId_date: { accountId: data.accountId, date: data.date } },
        update: { ...clean, dailyPL, drawdownPct, enteredBy: req.user.id },
        create: { ...clean, dailyPL, drawdownPct, enteredBy: req.user.id },
      })
      results.push(snapshot)
    }
    res.json(results)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/snapshots/:id', async (req, res) => {
  try {
    await prisma.dailySnapshot.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Users ──
r.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    where: { role: 'TRADER' },
    select: {
      id: true, name: true, email: true, emailVerified: true, createdAt: true,
      propAccounts: { select: { id: true, status: true, startBalance: true, program: { select: { name: true } } } },
      _count: { select: { payoutRequests: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(users)
})

// User detail with EVERYTHING
r.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, name: true, email: true, role: true, emailVerified: true,
      kycVerifiedAt: true, telegramChatId: true, notes: true, createdAt: true,
      propAccounts: {
        include: {
          program: true,
          snapshots: { orderBy: { date: 'desc' }, take: 30 },
          _count: { select: { snapshots: true } },
        },
        orderBy: { startedAt: 'desc' },
      },
      payoutRequests: {
        include: { account: { include: { program: true } } },
        orderBy: { requestedAt: 'desc' },
      },
    },
  })
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

r.patch('/users/:id', async (req, res) => {
  try {
    const data = z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      emailVerified: z.boolean().optional(),
      kycVerifiedAt: z.coerce.date().optional().nullable(),
      telegramChatId: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }).parse(req.body)
    const user = await prisma.user.update({ where: { id: req.params.id }, data })
    res.json(user)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/users/:id', async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Account snapshots history (for admin view)
r.get('/accounts/:id/snapshots', async (req, res) => {
  const snapshots = await prisma.dailySnapshot.findMany({
    where: { accountId: req.params.id },
    orderBy: { date: 'desc' },
  })
  res.json(snapshots)
})

// ── Payouts ──
r.get('/payouts', async (req, res) => {
  const { status } = req.query
  const payouts = await prisma.payoutRequest.findMany({
    where: status ? { status } : {},
    include: { user: { select: { name: true, email: true } }, account: { include: { program: true } } },
    orderBy: { requestedAt: 'desc' },
  })
  res.json(payouts)
})

r.patch('/payouts/:id', async (req, res) => {
  try {
    const data = z.object({
      status: z.enum(['APPROVED', 'PAID', 'REJECTED']),
      txHash: z.string().optional(),
      rejectionReason: z.string().optional(),
    }).parse(req.body)
    const payout = await prisma.payoutRequest.update({
      where: { id: req.params.id },
      data: { ...data, processedAt: new Date() },
    })
    res.json(payout)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

export default r
