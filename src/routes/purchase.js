import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/middleware.js'
import { notifyPurchaseReceipt } from '../lib/telegram.js'

const r = Router()

// Public: get programs list
r.get('/programs', async (req, res) => {
  const programs = await prisma.program.findMany({
    where: { active: true },
    orderBy: { accountSize: 'asc' },
  })
  res.json(programs)
})

// Authenticated: submit purchase (receipt upload)
r.post('/request', requireAuth, async (req, res) => {
  try {
    const data = z.object({
      programId: z.string(),
      receiptUrl: z.string().url().optional(),
      notes: z.string().optional(),
    }).parse(req.body)

    const program = await prisma.program.findUnique({ where: { id: data.programId } })
    if (!program) return res.status(404).json({ error: 'Programma non trovato' })

    await notifyPurchaseReceipt({
      user: req.user,
      program,
      receiptUrl: data.receiptUrl,
    })

    res.json({ message: 'Richiesta inviata. Riceverai conferma entro 24h.' })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

export default r
