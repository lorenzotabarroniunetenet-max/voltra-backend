import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { encrypt } from '../lib/crypto.js'
import { provisionAccount, getAccountInfo, removeAccount, isMetaApiEnabled } from '../lib/mt5bridge.js'
import { attachMaster, detachMaster } from '../services/copyEngine.js'
import { requireAuth } from '../middleware/auth.js'
const r = Router()

const schema = z.object({
  label: z.string().min(1),
  type: z.enum(['MASTER','SLAVE']),
  broker: z.string().min(1),
  server: z.string().min(1),
  login: z.string().min(1),
  password: z.string().min(1),
  platform: z.string().optional()
})

r.post('/', requireAuth, async (req, res) => {
  try {
    const data = schema.parse(req.body)
    // Create DB row first as PROVISIONING
    const a = await prisma.mt5Account.create({
      data: {
        userId: req.user.id,
        label: data.label, type: data.type,
        broker: data.broker, server: data.server,
        login: data.login, passwordEnc: encrypt(data.password),
        platform: data.platform || 'MT5',
        status: 'PROVISIONING'
      }
    })

    // Provision in MetaApi async (don't block response)
    if (isMetaApiEnabled()) {
      provisionAccount({
        label: data.label, broker: data.broker, server: data.server,
        login: data.login, password: data.password,
        platform: (data.platform || 'mt5').toLowerCase()
      }).then(async (r) => {
        const info = await getAccountInfo(r.metaapiAccountId).catch(() => ({ balance: 0, equity: 0, currency: 'USD', leverage: 100 }))
        const updated = await prisma.mt5Account.update({
          where: { id: a.id },
          data: {
            metaapiAccountId: r.metaapiAccountId,
            metaapiState: r.state,
            status: 'ACTIVE',
            balance: info.balance || 0,
            equity: info.equity || 0,
            currency: info.currency || 'USD',
            leverage: info.leverage || 100,
            lastSync: new Date()
          }
        })
        if (updated.type === 'MASTER') attachMaster(updated).catch(e => console.error(e.message))
      }).catch(async (e) => {
        await prisma.mt5Account.update({
          where: { id: a.id },
          data: { status: 'DISCONNECTED', metaapiState: 'ERROR: ' + e.message }
        })
        console.error('[provision] failed:', e.message)
      })
    } else {
      // No MetaApi token - mark as active stub
      await prisma.mt5Account.update({ where: { id: a.id }, data: { status: 'ACTIVE' } })
    }

    res.json(strip(a))
  } catch (e) {
    res.status(e.code === 'P2002' ? 409 : 400).json({ error: e.code === 'P2002' ? 'Account already connected' : e.message })
  }
})

r.get('/', requireAuth, async (req, res) => {
  const accs = await prisma.mt5Account.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } })
  res.json(accs.map(strip))
})

r.get('/:id', requireAuth, async (req, res) => {
  const a = await prisma.mt5Account.findFirst({ where: { id: req.params.id, userId: req.user.id } })
  if (!a) return res.status(404).json({ error: 'Not found' })
  // Refresh from MetaApi
  if (a.metaapiAccountId && isMetaApiEnabled()) {
    try {
      const info = await getAccountInfo(a.metaapiAccountId)
      await prisma.mt5Account.update({ where: { id: a.id }, data: { balance: info.balance || 0, equity: info.equity || 0, lastSync: new Date() } })
      a.balance = info.balance || 0; a.equity = info.equity || 0
    } catch {}
  }
  res.json(strip(a))
})

r.patch('/:id', requireAuth, async (req, res) => {
  const a = await prisma.mt5Account.findFirst({ where: { id: req.params.id, userId: req.user.id } })
  if (!a) return res.status(404).json({ error: 'Not found' })
  const data = {}
  if ('label' in req.body) data.label = req.body.label
  if ('status' in req.body) data.status = req.body.status
  const u = await prisma.mt5Account.update({ where: { id: a.id }, data })
  res.json(strip(u))
})

r.delete('/:id', requireAuth, async (req, res) => {
  const a = await prisma.mt5Account.findFirst({ where: { id: req.params.id, userId: req.user.id } })
  if (!a) return res.status(404).json({ error: 'Not found' })
  if (a.type === 'MASTER') detachMaster(a.id)
  if (a.metaapiAccountId && isMetaApiEnabled()) removeAccount(a.metaapiAccountId).catch(()=>{})
  await prisma.mt5Account.delete({ where: { id: a.id } })
  res.json({ ok: true })
})

function strip(a) { const { passwordEnc, ...rest } = a; return rest }
export default r
