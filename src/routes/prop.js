import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/middleware.js'
import { notifyPayoutRequest } from '../lib/telegram.js'

const r = Router()
r.use(requireAuth)

r.get('/accounts', async (req, res) => {
  const accounts = await prisma.propAccount.findMany({
    where: { userId: req.user.id },
    include: { program: true },
    orderBy: { startedAt: 'desc' },
  })
  res.json(accounts)
})

r.get('/accounts/:id', async (req, res) => {
  const account = await prisma.propAccount.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { program: true },
  })
  if (!account) return res.status(404).json({ error: 'Account not found' })
  res.json(account)
})

r.get('/accounts/:id/snapshots', async (req, res) => {
  const account = await prisma.propAccount.findFirst({ where: { id: req.params.id, userId: req.user.id } })
  if (!account) return res.status(404).json({ error: 'Account not found' })
  const { from, to } = req.query
  const snapshots = await prisma.dailySnapshot.findMany({
    where: {
      accountId: req.params.id,
      ...(from && { date: { gte: new Date(from) } }),
      ...(to && { date: { lte: new Date(to) } }),
    },
    orderBy: { date: 'asc' },
  })
  res.json(snapshots)
})

r.get('/accounts/:id/stats', async (req, res) => {
  const account = await prisma.propAccount.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { program: true },
  })
  if (!account) return res.status(404).json({ error: 'Account not found' })

  const snapshots = await prisma.dailySnapshot.findMany({
    where: { accountId: req.params.id },
    orderBy: { date: 'asc' },
  })

  // Last payout for this account (for 7-day limit info)
  const lastPayout = await prisma.payoutRequest.findFirst({
    where: { accountId: req.params.id, status: { in: ['APPROVED', 'PAID', 'PENDING'] } },
    orderBy: { requestedAt: 'desc' },
  })

  const latest = snapshots[snapshots.length - 1]
  const startBalance = Number(account.startBalance)
  const program = account.program
  const equity = latest ? Number(latest.equity) : startBalance
  const balance = latest ? Number(latest.balance) : startBalance

  const mllFloor = startBalance * (1 - Number(program.maxOverallLossPct) / 100)
  const prevBalance = snapshots.length > 1 ? Number(snapshots[snapshots.length - 2].balance) : startBalance
  const dllFloor = prevBalance * (1 - Number(program.maxDailyLossPct) / 100)
  const tradingDays = snapshots.filter(s => (s.trades ?? 0) > 0).length
  const targetReached = program.profitTargetPct
    ? balance >= startBalance * (1 + Number(program.profitTargetPct) / 100) : null

  const rules = {
    maxDailyLoss: { status: equity < dllFloor ? 'FAILED' : 'OK', current: equity, limit: dllFloor },
    maxOverallLoss: { status: equity < mllFloor ? 'FAILED' : 'OK', current: equity, limit: mllFloor },
    profitTarget: program.profitTargetPct ? {
      status: targetReached ? 'SUCCEEDED' : 'PENDING',
      current: balance,
      target: startBalance * (1 + Number(program.profitTargetPct) / 100),
    } : null,
    minTradingDays: program.minTradingDays ? {
      status: tradingDays >= program.minTradingDays ? 'SUCCEEDED' : 'PENDING',
      current: tradingDays,
      required: program.minTradingDays,
    } : null,
    scalping: program.scalpingAllowed ? 'ALLOWED' : 'NOT_ALLOWED',
    news: program.newsAllowed ? 'ALLOWED' : 'NOT_ALLOWED',
    weekendHold: program.weekendHoldAllowed ? 'ALLOWED' : 'NOT_ALLOWED',
  }

  // Payout eligibility (7-day rule)
  const payoutInfo = computePayoutEligibility(lastPayout, program.payoutFrequencyDays || 7)

  const allBest = snapshots.map(s => Number(s.bestTrade ?? 0))
  const allWorst = snapshots.map(s => Number(s.worstTrade ?? 0))
  const stats = {
    bestTrade: allBest.length ? Math.max(...allBest) : null,
    worstTrade: allWorst.length ? Math.min(...allWorst) : null,
    avgWin: latest ? Number(latest.avgWin) : null,
    avgLoss: latest ? Number(latest.avgLoss) : null,
    totalTrades: snapshots.reduce((a, s) => a + (s.trades ?? 0), 0),
    totalVolume: snapshots.reduce((a, s) => a + Number(s.volume ?? 0), 0),
    winRatePct: latest ? Number(latest.winRatePct) : null,
    profitFactor: latest ? Number(latest.profitFactor) : null,
    currentBalance: balance,
    currentEquity: equity,
    dailyPL: latest ? Number(latest.dailyPL) : 0,
    drawdownPct: latest ? Number(latest.drawdownPct) : 0,
    tradingDays,
  }

  res.json({ account, program, rules, stats, snapshots, payoutInfo })
})

function computePayoutEligibility(lastPayout, freqDays) {
  if (!lastPayout) return { eligible: true, freqDays, daysLeft: 0 }
  const last = new Date(lastPayout.requestedAt)
  const now = new Date()
  const daysPassed = Math.floor((now - last) / (1000 * 60 * 60 * 24))
  if (daysPassed >= freqDays) return { eligible: true, freqDays, daysLeft: 0 }
  return {
    eligible: false,
    freqDays,
    daysLeft: freqDays - daysPassed,
    lastRequestDate: lastPayout.requestedAt,
    nextEligibleDate: new Date(last.getTime() + freqDays * 24 * 60 * 60 * 1000),
  }
}

r.get('/payouts', async (req, res) => {
  const payouts = await prisma.payoutRequest.findMany({
    where: { userId: req.user.id },
    include: { account: { include: { program: true } } },
    orderBy: { requestedAt: 'desc' },
  })
  res.json(payouts)
})

r.post('/payouts', async (req, res) => {
  try {
    const data = z.object({
      accountId: z.string(),
      amountUsd: z.number().positive().min(50),
      cryptoNetwork: z.enum(['USDT_TRC20', 'USDT_ERC20', 'USDC_ERC20', 'USDC_SOLANA', 'BTC', 'ETH']),
      cryptoAddress: z.string().min(10),
    }).parse(req.body)

    const account = await prisma.propAccount.findFirst({
      where: { id: data.accountId, userId: req.user.id, status: 'ACTIVE' },
      include: { program: true },
    })
    if (!account) return res.status(404).json({ error: 'Account non trovato o non attivo' })

    // Check se il rimborso è abilitato dall'admin
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { payoutEnabled: true } })
    if (!user?.payoutEnabled) {
      return res.status(403).json({ error: 'Il rimborso non è ancora disponibile. Contatta il Comando per abilitarlo.' })
    }

    // HARD LIMIT: 7-day rule
    const lastPayout = await prisma.payoutRequest.findFirst({
      where: { accountId: data.accountId, status: { in: ['APPROVED', 'PAID', 'PENDING'] } },
      orderBy: { requestedAt: 'desc' },
    })
    const freqDays = account.program.payoutFrequencyDays || 7
    if (lastPayout) {
      const daysPassed = Math.floor((Date.now() - new Date(lastPayout.requestedAt).getTime()) / (1000 * 60 * 60 * 24))
      if (daysPassed < freqDays) {
        return res.status(403).json({
          error: `Devi aspettare ${freqDays - daysPassed} giorni prima di poter richiedere un nuovo payout. Il programma permette payout ogni ${freqDays} giorni.`,
        })
      }
    }

    const payout = await prisma.payoutRequest.create({ data: { ...data, userId: req.user.id } })
    notifyPayoutRequest({
      user: req.user, account, program: account.program,
      amount: data.amountUsd, network: data.cryptoNetwork, address: data.cryptoAddress,
    }).catch(() => {})

    res.json(payout)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

export default r
