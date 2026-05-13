import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { signToken } from '../lib/jwt.js'
const r = Router()

r.post('/register', async (req, res) => {
  try {
    const { email, password, name } = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(1) }).parse(req.body)
    if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: 'Email already registered' })
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({ data: { email, name, passwordHash } })
    res.json({ token: signToken({ userId: user.id, role: user.role }), user: { id: user.id, email, name, role: user.role, plan: user.plan } })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/login', async (req, res) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body)
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid credentials' })
    res.json({ token: signToken({ userId: user.id, role: user.role }), user: { id: user.id, email, name: user.name, role: user.role, plan: user.plan } })
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
