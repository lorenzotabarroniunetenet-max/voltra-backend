import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { encrypt } from '../lib/crypto.js'
import { mt5Bridge } from '../lib/mt5bridge.js'
import { requireAuth } from '../middleware/auth.js'
const r = Router()
r.post('/connect', requireAuth, async (req, res) => {
  try {
    const data = z.object({ label: z.string().min(1), broker: z.string().min(1), server: z.string().min(1), login: z.string().min(1), password: z.string().min(1) }).parse(req.body)
    const v = await mt5Bridge.connectAccount(data)
    if (!v.ok) return res.status(400).json({ error: 'Invalid MT5 credentials' })
    const a = await prisma.mt5Account.create({ data: { userId: req.user.id, label: data.label, broker: data.broker, server: data.server, login: data.login, passwordEnc: encrypt(data.password), balance: v.balance, equity: v.equity, currency: v.currency, leverage: v.leverage } })
    res.json({ id: a.id, label: a.label, broker: a.broker, balance: a.balance })
  } catch (e) { res.status(e.code==='P2002'?409:400).json({ error: e.message }) }
})
r.get('/accounts', requireAuth, async (req, res) => {
  res.json(await prisma.mt5Account.findMany({ where: { userId: req.user.id }, select: { id:true,label:true,broker:true,server:true,login:true,balance:true,equity:true,currency:true,leverage:true,active:true,createdAt:true } }))
})
r.delete('/accounts/:id', requireAuth, async (req, res) => {
  await prisma.mt5Account.deleteMany({ where: { id: req.params.id, userId: req.user.id } }); res.json({ ok: true })
})
export default r
