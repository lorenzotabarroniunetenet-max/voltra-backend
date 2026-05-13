import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
const r = Router()

r.get('/', requireAuth, async (req, res) => {
  const { ruleId, limit = 100 } = req.query
  const rules = await prisma.copyRule.findMany({ where: { userId: req.user.id }, select: { id: true } })
  const ruleIds = rules.map(r => r.id)
  const where = { ruleId: { in: ruleIds } }
  if (ruleId) where.ruleId = ruleId
  const trades = await prisma.trade.findMany({
    where, orderBy: { openedAt: 'desc' }, take: parseInt(limit),
    include: { rule: { include: { master: true, slave: true } } }
  })
  trades.forEach(t => {
    if (t.rule?.master) delete t.rule.master.passwordEnc
    if (t.rule?.slave) delete t.rule.slave.passwordEnc
  })
  res.json(trades)
})

r.get('/stats', requireAuth, async (req, res) => {
  const rules = await prisma.copyRule.findMany({ where: { userId: req.user.id }, select: { id: true } })
  const ruleIds = rules.map(r => r.id)
  const [total, open, closed, pnl] = await Promise.all([
    prisma.trade.count({ where: { ruleId: { in: ruleIds } } }),
    prisma.trade.count({ where: { ruleId: { in: ruleIds }, status: 'OPEN' } }),
    prisma.trade.count({ where: { ruleId: { in: ruleIds }, status: 'CLOSED' } }),
    prisma.trade.aggregate({ where: { ruleId: { in: ruleIds }, status: 'CLOSED' }, _sum: { pnl: true } })
  ])
  res.json({ total, open, closed, totalPnl: pnl._sum.pnl || 0 })
})

export default r
