import jwt from 'jsonwebtoken'
const SECRET = process.env.JWT_SECRET || 'change-me-in-production'
export const signToken = (p) => jwt.sign(p, SECRET, { expiresIn: '7d' })
export const verifyToken = (t) => jwt.verify(t, SECRET)
