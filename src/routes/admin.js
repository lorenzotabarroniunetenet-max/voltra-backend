import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../lib/middleware.js'

const r = Router()
r.use(requireAuth, requireAdmin)

// ── Programs ──────────────────────────────────────────────
r.get('/programs', async (req, res) => {
  const programs = await prisma.program.findMany({ orderBy: { accountSize: 'asc' } })
  res.json(programs)
})

r.post('/programs', async (req, res) => {
  try {
    const data = z.object({
      name: z.string(),
      accountSize: z.number().positive(),
      phase: z.enum(['CHALLENGE','VERIFICATION','FUNDED','INSTANT']),
      profitTargetPct: z.number().optional().nullable(),
      maxDailyLossPct: z.number().positive(),
      maxOverallLossPct: z.number().positive(),
      minTradingDays: z.number().int().optional().nullable(),
      profitSplitPct: z.number().positive(),
      priceUsd: z.number().optional().nullable(),
      activationFeeUsd: z.number().optional().nullable(),
    }).parse(req.body)
    const program = await prisma.program.create({ data })
    res.json(program)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Accounts (prop accounts per trader) ──────────────────
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
      data: { actorId: req.user.id, entity: 'PropAccount', entityId: account.id, action: 'CREATE', after: account }
    })
    res.json(account)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.patch('/accounts/:id', async (req, res) => {
  try {
    const data = z.object({
      status: z.enum(['ACTIVE','PASSED','FAILED','PAID_OUT']).optional(),
      failureReason: z.string().optional(),
      endedAt: z.coerce.date().optional(),
    }).parse(req.body)
    const before = await prisma.propAccount.findUnique({ where: { id: req.params.id } })
    const account = await prisma.propAccount.update({ where: { id: req.params.id }, data })
    await prisma.auditLog.create({
      data: { actorId: req.user.id, entity: 'PropAccount', entityId: account.id, action: 'UPDATE', before, after: account }
    })
    res.json(account)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Daily Snapshots ───────────────────────────────────────
r.post('/snapshots', async (req, res) => {
  try {
    const SnapshotSchema = z.object({
      accountId: z.string(),
      date: z.coerce.date(),
      balance: z.number().positive(),
      equity: z.number().positive(),
      trades: z.number().int().nonnegative().optional(),
      volume: z.number().nonnegative().optional(),
      bestTrade: z.number().optional(),
      worstTrade: z.number().optional(),
      avgWin: z.number().optional(),
      avgLoss: z.number().optional(),
      winRatePct: z.number().min(0).max(100).optional(),
      profitFactor: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    })

    const items = Array.isArray(req.body) ? req.body : [req.body]
    const results = []

    for (const item of items) {
      const data = SnapshotSchema.parse(item)
      const account = await prisma.propAccount.findUnique({
        where: { id: data.accountId },
        include: { program: true, snapshots: { orderBy: { date: 'desc' }, take: 1 } }
      })
      if (!account) continue

      // Compute derived fields
      const startBalance = Number(account.startBalance)
      const prevSnapshot = account.snapshots[0]
      const prevBalance = prevSnapshot ? Number(prevSnapshot.balance) : startBalance
      const dailyPL = data.balance - prevBalance
      const drawdownPct = ((startBalance - data.equity) / startBalance) * 100

      const snapshot = await prisma.dailySnapshot.upsert({
        where: { accountId_date: { accountId: data.accountId, date: data.date } },
        update: { ...data, dailyPL, drawdownPct, enteredBy: req.user.id },
        create: { ...data, dailyPL, drawdownPct, enteredBy: req.user.id },
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

// ── Users ─────────────────────────────────────────────────
r.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    where: { role: 'TRADER' },
    select: { id: true, name: true, email: true, emailVerified: true, createdAt: true, propAccounts: { select: { id: true, status: true } } },
    orderBy: { createdAt: 'desc' },
  })
  res.json(users)
})

// ── Payouts ───────────────────────────────────────────────
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
      status: z.enum(['APPROVED','PAID','REJECTED']),
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
