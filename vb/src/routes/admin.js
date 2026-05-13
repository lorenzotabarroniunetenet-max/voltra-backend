import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
const r = Router()
r.use(requireAuth, requireAdmin)
r.get('/users', async (req, res) => {
  res.json(await prisma.user.findMany({ select: { id:true,email:true,name:true,role:true,createdAt:true, _count: { select: { mt5Accounts:true, copyRelations:true } } }, orderBy: { createdAt: 'desc' } }))
})
r.get('/masters', async (req, res) => {
  res.json(await prisma.master.findMany({ include: { _count: { select: { copyRelations:true, trades:true } } }, orderBy: { createdAt: 'desc' } }))
})
r.post('/masters', async (req, res) => {
  try { res.json(await prisma.master.create({ data: req.body })) }
  catch (e) { res.status(e.code==='P2002'?409:400).json({ error: e.message }) }
})
r.patch('/masters/:id', async (req, res) => {
  try { res.json(await prisma.master.update({ where: { id: req.params.id }, data: req.body })) }
  catch (e) { res.status(400).json({ error: e.message }) }
})
r.delete('/masters/:id', async (req, res) => {
  await prisma.master.delete({ where: { id: req.params.id } }); res.json({ ok: true })
})
r.get('/stats', async (req, res) => {
  const [users, activeMasters, activeCopies, pnl] = await Promise.all([
    prisma.user.count(), prisma.master.count({ where: { status:'ACTIVE' } }),
    prisma.copyRelation.count({ where: { status:'ACTIVE' } }),
    prisma.trade.aggregate({ _sum: { pnl: true } })
  ])
  res.json({ users, activeMasters, activeCopies, totalPnl: pnl._sum.pnl || 0 })
})
export default r
