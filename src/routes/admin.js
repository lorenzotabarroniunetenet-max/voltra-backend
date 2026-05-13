import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
const r = Router()
r.use(requireAuth, requireAdmin)

r.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id:true, email:true, name:true, role:true, plan:true, createdAt:true, _count: { select: { accounts:true, rules:true } } },
    orderBy: { createdAt: 'desc' }
  })
  res.json(users)
})

r.patch('/users/:id', async (req, res) => {
  try {
    const data = {}
    if ('role' in req.body) data.role = req.body.role
    if ('plan' in req.body) data.plan = req.body.plan
    const u = await prisma.user.update({ where: { id: req.params.id }, data })
    res.json(u)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.get('/stats', async (req, res) => {
  const [users, accounts, rules, trades, openTrades] = await Promise.all([
    prisma.user.count(),
    prisma.mt5Account.count(),
    prisma.copyRule.count({ where: { status: 'ACTIVE' } }),
    prisma.trade.count(),
    prisma.trade.count({ where: { status: 'OPEN' } })
  ])
  res.json({ users, accounts, activeRules: rules, totalTrades: trades, openTrades })
})

export default r
