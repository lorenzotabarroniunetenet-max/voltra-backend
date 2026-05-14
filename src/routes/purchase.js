import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/middleware.js'
import { getSetting } from '../lib/settings.js'
import { notifyPurchaseReceipt } from '../lib/telegram.js'

const r = Router()

r.get('/programs', async (req, res) => {
  const programs = await prisma.program.findMany({
    where: { active: true },
    orderBy: [{ phase: 'asc' }, { accountSize: 'asc' }],
  })
  res.json(programs)
})

r.get('/payment-info', async (req, res) => {
  const address = await getSetting('PAYMENT_ADDRESS', process.env.PAYMENT_ADDRESS || '')
  const network = await getSetting('PAYMENT_NETWORK', process.env.PAYMENT_NETWORK || 'USDT TRC20')
  res.json({ address, network })
})

r.post('/request', requireAuth, async (req, res) => {
  try {
    const { programId, receiptUrl } = z.object({
      programId: z.string(),
      receiptUrl: z.string().optional(),
    }).parse(req.body)

    const program = await prisma.program.findUnique({ where: { id: programId } })
    if (!program) return res.status(404).json({ error: 'Programma non trovato' })

    notifyPurchaseReceipt({ user: req.user, program, receiptUrl }).catch(() => {})

    res.json({
      message: 'Richiesta ricevuta. Verifichiamo il pagamento e ti contatteremo entro 24h.',
    })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

export default r
