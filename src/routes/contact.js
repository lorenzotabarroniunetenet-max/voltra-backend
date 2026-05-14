import { Router } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { getSetting } from '../lib/settings.js'
import { sendContactEmail } from '../lib/email.js'
import { notifyContact } from '../lib/telegram.js'

const r = Router()

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Troppe richieste, riprova tra un minuto.' },
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

export default r
