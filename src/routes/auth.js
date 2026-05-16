import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import { prisma } from '../lib/prisma.js'
import { signToken } from '../lib/jwt.js'
import { requireAuth } from '../lib/middleware.js'
import { sendVerificationEmail, sendWelcomeEmail, sendApprovalEmail, sendPasswordResetEmail, sendLoginCodeEmail } from '../lib/email.js'

const r = Router()

r.post('/register', async (req, res) => {
  try {
    const { email, password, name } = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1),
    }).parse(req.body)

    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) return res.status(409).json({ error: 'Email già registrata' })

    const passwordHash = await bcrypt.hash(password, 10)
    const emailVerifyToken = randomBytes(32).toString('hex')

    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: 'TRADER', emailVerifyToken },
    })

    await sendVerificationEmail(email, name, emailVerifyToken)

    res.json({
      message: "Registrazione completata. Controlla la tua email per verificare l'account.",
      userId: user.id,
    })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.get('/verify-email', async (req, res) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.query)
    const user = await prisma.user.findUnique({ where: { emailVerifyToken: token } })
    if (!user) return res.status(404).json({ error: 'Token non valido' })

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    })

    sendWelcomeEmail(user.email, user.name).catch(() => {})

    res.json({ message: 'Email verificata con successo!' })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/resend-verify', async (req, res) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body)
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(404).json({ error: 'Utente non trovato' })
    if (user.emailVerified) return res.status(400).json({ error: 'Email già verificata' })

    const emailVerifyToken = randomBytes(32).toString('hex')
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifyToken } })
    await sendVerificationEmail(email, user.name, emailVerifyToken)

    res.json({ message: 'Email di verifica inviata' })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/login', async (req, res) => {
  try {
    const { email, password, emailOtp } = z.object({
      email: z.string().email(),
      password: z.string(),
      emailOtp: z.string().optional(),
    }).parse(req.body)
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Credenziali non valide' })
    }
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Email non verificata. Controlla la tua casella.' })
    }
    if (!user.approved && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Accesso in attesa di approvazione. Ti contatteremo a breve.' })
    }

    // 2FA via email
    if (user.email2faEnabled) {
      if (!emailOtp) {
        // Genera e invia codice via email
        const code = String(Math.floor(100000 + Math.random() * 900000))
        const expiry = new Date(Date.now() + 10 * 60 * 1000) // 10 minuti
        await prisma.user.update({
          where: { id: user.id },
          data: { email2faCode: code, email2faExpiry: expiry },
        })
        sendLoginCodeEmail(user.email, user.name, code).catch(() => {})
        return res.status(401).json({ error: 'EMAIL_OTP_REQUIRED', emailOtpRequired: true, message: 'Codice inviato alla tua email.' })
      }
      // Verifica codice
      if (!user.email2faCode || !user.email2faExpiry || user.email2faExpiry < new Date()) {
        return res.status(401).json({ error: 'Codice scaduto. Effettua nuovamente l\'accesso.' })
      }
      if (emailOtp.trim() !== user.email2faCode) {
        return res.status(401).json({ error: 'Codice non valido.' })
      }
      // Codice consumato
      await prisma.user.update({
        where: { id: user.id },
        data: { email2faCode: null, email2faExpiry: null },
      })
    }

    // Nudge: se 2FA non attivo e non disattivato, crea notifica suggerimento
    if (!user.email2faEnabled && !user.email2faNudgeOff && user.role !== 'ADMIN') {
      // Limit: solo una notifica nudge attiva
      const existing = await prisma.notification.findFirst({
        where: { userId: user.id, type: '2fa_nudge', readAt: null },
      })
      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: '2fa_nudge',
            title: 'Aumenta la sicurezza del tuo accesso',
            body: 'Attiva la verifica via email. È gratuita e ti protegge da accessi non autorizzati.',
            url: '/sicurezza-accesso',
          },
        }).catch(() => {})
      }
    }

    res.json({
      token: signToken({ userId: user.id, role: user.role }),
      user: { id: user.id, email, name: user.name, role: user.role, plan: user.plan, rank: user.rank },
    })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/forgot-password', async (req, res) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body)
    const user = await prisma.user.findUnique({ where: { email } })
    // Risposta uguale anche se non trovato (no enumeration)
    if (user) {
      const resetToken = randomBytes(32).toString('hex')
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000) // 1h
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExpiry },
      })
      sendPasswordResetEmail(user.email, user.name, resetToken).catch(() => {})
    }
    res.json({ message: 'Se la Linea risulta in archivio, riceverai le istruzioni a breve.' })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = z.object({
      token: z.string(),
      password: z.string().min(8),
    }).parse(req.body)

    const user = await prisma.user.findUnique({ where: { resetToken: token } })
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ error: 'Token non valido o scaduto. Richiedere nuovo recupero.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    })

    res.json({ message: 'Credenziale aggiornata. Procedere con l\'accesso.' })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current, next } = z.object({
      current: z.string(),
      next: z.string().min(8),
    }).parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    const ok = await bcrypt.compare(current, user.passwordHash)
    if (!ok) return res.status(400).json({ error: 'Credenziale attuale non corretta.' })

    const passwordHash = await bcrypt.hash(next, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ─── 2FA via Email ───
r.post('/email-2fa/enable', requireAuth, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { email2faEnabled: true },
    })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/email-2fa/disable', requireAuth, async (req, res) => {
  try {
    const { password } = z.object({ password: z.string() }).parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(400).json({ error: 'Credenziale non corretta.' })
    await prisma.user.update({
      where: { id: user.id },
      data: { email2faEnabled: false, email2faCode: null, email2faExpiry: null },
    })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.get('/email-2fa/status', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { email2faEnabled: true, email2faNudgeOff: true },
  })
  res.json({ enabled: !!user?.email2faEnabled, nudgeOff: !!user?.email2faNudgeOff })
})

r.post('/email-2fa/dismiss-nudge', requireAuth, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { email2faNudgeOff: true },
    })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.get('/me', async (req, res) => {
  try {
    const h = req.headers.authorization || ''
    const t = h.startsWith('Bearer ') ? h.slice(7) : null
    if (!t) return res.status(401).json({ error: 'No token' })
    const { verifyToken } = await import('../lib/jwt.js')
    const d = verifyToken(t)
    const u = await prisma.user.findUnique({ where: { id: d.userId } })
    if (!u) return res.status(401).json({ error: 'Invalid user' })
    res.json({ id: u.id, email: u.email, name: u.name, role: u.role, plan: u.plan })
  } catch { res.status(401).json({ error: 'Invalid token' }) }
})

export default r
