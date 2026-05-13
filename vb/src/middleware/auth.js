import { verifyToken } from '../lib/jwt.js'
import { prisma } from '../lib/prisma.js'
export async function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || ''
    const t = h.startsWith('Bearer ') ? h.slice(7) : null
    if (!t) return res.status(401).json({ error: 'No token' })
    const d = verifyToken(t)
    const user = await prisma.user.findUnique({ where: { id: d.userId } })
    if (!user) return res.status(401).json({ error: 'Invalid user' })
    req.user = user; next()
  } catch { return res.status(401).json({ error: 'Invalid token' }) }
}
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' })
  next()
}
