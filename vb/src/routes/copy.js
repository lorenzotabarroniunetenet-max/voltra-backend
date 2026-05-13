import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { mt5Bridge } from '../lib/mt5bridge.js'
import { requireAuth } from '../middleware/auth.js'
const r = Router()
r.post('/start', requireAuth, async (req, res) => {
  try {
    const data = z.object({ masterId: z.string(), mt5AccountId: z.string(), lotRatio: z.number().min(0.01).max(10), maxDrawdown: z.number().min(1).max(50) }).parse(req.body)
    const acc = await prisma.mt5Account.findFirst({ where: { id: data.mt5AccountId, userId: req.user.id } })
    if (!acc) return res.status(404).json({ error: 'Account not found' })
    const master = await prisma.master.findUnique({ where: { id: data.masterId } })
    if (!master || master.status !== 'ACTIVE') return res.status(404).json({ error: 'Master unavailable' })
    const br = await mt5Bridge.startCopy({ masterId: master.id, slaveAccountId: acc.id, lotRatio: data.lotRatio, maxDrawdown: data.maxDrawdown })
    if (!br.ok) return res.status(500).json({ error: 'Bridge failed' })
    const rel = await prisma.copyRelation.upsert({
      where: { userId_masterId_mt5AccountId: { userId: req.user.id, masterId: data.masterId, mt5AccountId: data.mt5AccountId } },
      update: { lotRatio: data.lotRatio, maxDrawdown: data.maxDrawdown, status: 'ACTIVE' },
      create: { userId: req.user.id, masterId: data.masterId, mt5AccountId: data.mt5AccountId, lotRatio: data.lotRatio, maxDrawdown: data.maxDrawdown }
    })
    await prisma.master.update({ where: { id: master.id }, data: { followersCount: { increment: 1 } } })
    res.json(rel)
  } catch (e) { res.status(400).json({ error: e.message }) }
})
r.post('/stop', requireAuth, async (req, res) => {
  const rel = await prisma.copyRelation.findFirst({ where: { id: req.body.relationId, userId: req.user.id } })
  if (!rel) return res.status(404).json({ error: 'Not found' })
  await mt5Bridge.stopCopy(`sub-${rel.masterId}-${rel.mt5AccountId}`)
  await prisma.copyRelation.update({ where: { id: rel.id }, data: { status: 'STOPPED' } })
  res.json({ ok: true })
})
r.get('/', requireAuth, async (req, res) => {
  res.json(await prisma.copyRelation.findMany({ where: { userId: req.user.id }, include: { master: true, mt5Account: true }, orderBy: { createdAt: 'desc' } }))
})
export default r
