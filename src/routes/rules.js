import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
const r = Router()

const ruleSchema = z.object({
  label: z.string().min(1),
  masterAccountId: z.string(),
  slaveAccountId: z.string(),
  reverse: z.boolean().optional(),
  lotMode: z.enum(['MULTIPLIER','FIXED','PROPORTIONAL']).optional(),
  lotValue: z.number().min(0.01).max(100).optional(),
  tpMode: z.enum(['COPY','OVERRIDE','DISABLED']).optional(),
  tpValue: z.number().optional(),
  slMode: z.enum(['COPY','OVERRIDE','DISABLED']).optional(),
  slValue: z.number().optional(),
  symbolWhitelist: z.string().optional(),
  symbolBlacklist: z.string().optional(),
  maxDrawdown: z.number().min(0).max(100).optional(),
  maxSlippage: z.number().min(0).max(100).optional(),
  status: z.enum(['ACTIVE','PAUSED']).optional()
})

r.post('/', requireAuth, async (req, res) => {
  try {
    const data = ruleSchema.parse(req.body)
    const master = await prisma.mt5Account.findFirst({ where: { id: data.masterAccountId, userId: req.user.id, type: 'MASTER' } })
    const slave = await prisma.mt5Account.findFirst({ where: { id: data.slaveAccountId, userId: req.user.id, type: 'SLAVE' } })
    if (!master) return res.status(400).json({ error: 'Master account not found or wrong type' })
    if (!slave) return res.status(400).json({ error: 'Slave account not found or wrong type' })
    const rule = await prisma.copyRule.create({ data: { ...data, userId: req.user.id } })
    res.json(rule)
  } catch (e) { res.status(e.code === 'P2002' ? 409 : 400).json({ error: e.code === 'P2002' ? 'Rule already exists for this master/slave pair' : e.message }) }
})

r.get('/', requireAuth, async (req, res) => {
  const rules = await prisma.copyRule.findMany({
    where: { userId: req.user.id },
    include: { master: true, slave: true },
    orderBy: { createdAt: 'desc' }
  })
  rules.forEach(r => { delete r.master.passwordEnc; delete r.slave.passwordEnc })
  res.json(rules)
})

r.get('/:id', requireAuth, async (req, res) => {
  const rule = await prisma.copyRule.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { master: true, slave: true }
  })
  if (!rule) return res.status(404).json({ error: 'Not found' })
  delete rule.master.passwordEnc; delete rule.slave.passwordEnc
  res.json(rule)
})

r.patch('/:id', requireAuth, async (req, res) => {
  try {
    const exists = await prisma.copyRule.findFirst({ where: { id: req.params.id, userId: req.user.id } })
    if (!exists) return res.status(404).json({ error: 'Not found' })
    const data = ruleSchema.partial().parse(req.body)
    delete data.masterAccountId; delete data.slaveAccountId
    const updated = await prisma.copyRule.update({ where: { id: exists.id }, data })
    res.json(updated)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/:id', requireAuth, async (req, res) => {
  await prisma.copyRule.deleteMany({ where: { id: req.params.id, userId: req.user.id } })
  res.json({ ok: true })
})

export default r
