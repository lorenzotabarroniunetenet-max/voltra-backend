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
    res.json({ token: signToken({ userId: user.id, role: user.role }), user: { id: user.id, email, name, role: user.role } })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
r.post('/login', async (req, res) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body)
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid credentials' })
    res.json({ token: signToken({ userId: user.id, role: user.role }), user: { id: user.id, email, name: user.name, role: user.role } })
  } catch (e) { res.status(400).json({ error: e.message }) }
})
export default r
