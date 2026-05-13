import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
const r = Router()
r.get('/', async (req, res) => {
  const { masterId, limit=50 } = req.query
  res.json(await prisma.trade.findMany({ where: masterId ? { masterId } : {}, orderBy: { closedAt: 'desc' }, take: parseInt(limit) }))
})
r.get('/mine', requireAuth, async (req, res) => {
  const rels = await prisma.copyRelation.findMany({ where: { userId: req.user.id, status: 'ACTIVE' }, select: { masterId: true, master: { select: { name: true } } } })
  const ids = rels.map(r => r.masterId)
  if (!ids.length) return res.json([])
  const trades = await prisma.trade.findMany({ where: { masterId: { in: ids } }, orderBy: { closedAt: 'desc' }, take: 100 })
  const map = Object.fromEntries(rels.map(r => [r.masterId, r.master.name]))
  res.json(trades.map(t => ({ ...t, masterName: map[t.masterId] })))
})
export default r
