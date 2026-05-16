import { Router } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { getSetting } from '../lib/settings.js'
import { sendContactEmail } from '../lib/email.js'
import { notifyContact, notifySupportTicket } from '../lib/telegram.js'
import { requireAuth } from '../lib/middleware.js'

const r = Router()

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Troppe richieste, riprova tra un minuto.' },
})

const ticketLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { error: 'Troppe richieste. Attendere alcuni minuti.' },
})

r.get('/info', async (req, res) => {
  const supportEmail = await getSetting('SUPPORT_EMAIL', '')
  const telegramUrl = await getSetting('TELEGRAM_SUPPORT_URL', '')
  const telegramHandle = await getSetting('TELEGRAM_SUPPORT_HANDLE', '')
  res.json({ supportEmail, telegramUrl, telegramHandle })
})

r.post('/send', limiter, async (req, res) => {
  try {
    const data = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      subject: z.string().optional().default(''),
      message: z.string().min(5),
    }).parse(req.body)

    await sendContactEmail(data)
    notifyContact(data).catch(() => {})

    res.json({ message: 'Messaggio inviato. Ti rispondiamo entro 24 ore.' })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Ticket strutturato (solo membri autenticati)
r.post('/ticket', requireAuth, ticketLimiter, async (req, res) => {
  try {
    const data = z.object({
      category: z.enum(['pagamento', 'tecnico', 'onorificenze', 'grado', 'altro']),
      subject: z.string().min(3).max(120),
      message: z.string().min(10).max(2000),
    }).parse(req.body)

    notifySupportTicket({
      user: req.user,
      category: data.category,
      subject: data.subject,
      message: data.message,
    }).catch(() => {})

    res.json({ message: 'Ticket trasmesso al Comando. Risposta entro 24 ore sul tuo canale Telegram o email.' })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

export default r
