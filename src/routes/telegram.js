import { Router } from 'express'
import { nanoid } from 'nanoid'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/middleware.js'

const r = Router()

// Genera token di collegamento account (utente loggato)
r.post('/link-token', requireAuth, async (req, res) => {
  try {
    // Invalida token precedenti non usati
    await prisma.telegramLinkToken.deleteMany({
      where: { userId: req.user.id, usedAt: null },
    })
    const token = nanoid(32)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minuti
    await prisma.telegramLinkToken.create({
      data: { token, userId: req.user.id, expiresAt },
    })
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'voltra_comando'
    res.json({
      url: `https://t.me/${botUsername}?start=${token}`,
      expiresAt,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Stato collegamento
r.get('/status', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { telegramChatId: true },
  })
  res.json({ linked: !!user?.telegramChatId })
})

// Scollega Telegram
r.delete('/unlink', requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { telegramChatId: null },
  })
  res.json({ ok: true })
})

export default r
