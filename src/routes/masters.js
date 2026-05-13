import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
const r = Router()
r.get('/', async (req, res) => {
  const { sortBy='roi12m', minRoi, maxDd, minRating } = req.query
  const where = { status: 'ACTIVE' }
  if (minRoi) where.roi12m = { gte: parseFloat(minRoi) }
  if (maxDd) where.drawdown = { lte: parseFloat(maxDd) }
  if (minRating) where.rating = { gte: parseFloat(minRating) }
  res.json(await prisma.master.findMany({ where, orderBy: { [sortBy]: 'desc' } }))
})
r.get('/:id', async (req, res) => {
  const m = await prisma.master.findUnique({ where: { id: req.params.id }, include: { equityPoints: { orderBy: { date: 'asc' } }, trades: { orderBy: { closedAt: 'desc' }, take: 50 } } })
  if (!m) return res.status(404).json({ error: 'Not found' })
  res.json(m)
})
export default r
