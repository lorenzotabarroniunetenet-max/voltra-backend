import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import { prisma } from '../lib/prisma.js'
import { signToken } from '../lib/jwt.js'
import { sendVerificationEmail, sendWelcomeEmail } from '../lib/email.js'

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
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body)
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Credenziali non valide' })
    }
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Email non verificata. Controlla la tua casella.' })
    }
    res.json({
      token: signToken({ userId: user.id, role: user.role }),
      user: { id: user.id, email, name: user.name, role: user.role, plan: user.plan },
    })
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
