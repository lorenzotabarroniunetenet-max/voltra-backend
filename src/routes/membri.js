import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../lib/middleware.js'
import { GRADE_LORE, DECORATIONS, PURCHASE_THRESHOLDS, generateMatricola } from '../lib/lore.js'

const r = Router()
r.use(requireAuth)

// ─── Requisiti onorificenze (progressione operativa) ───
r.get('/requisiti', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { purchaseCount: true },
  })
  const count = user?.purchaseCount || 0

  const awards = await prisma.decorationAward.findMany({
    where: { userId: req.user.id },
    include: { decoration: { select: { slug: true } } },
  })
  const awardedSlugs = new Set(awards.map(a => a.decoration.slug))

  const requisiti = PURCHASE_THRESHOLDS.map(t => ({
    slug: t.slug,
    name: t.name,
    iconKey: t.iconKey,
    threshold: t.threshold,
    progress: Math.min(count, t.threshold),
    percentage: Math.min(100, Math.round((count / t.threshold) * 100)),
    achieved: count >= t.threshold,
    awarded: awardedSlugs.has(t.slug),
  }))

  res.json({
    purchaseCount: count,
    requisiti,
  })
})

// ─── Briefings (Sala Briefing) ───
r.get('/briefings', async (req, res) => {
  const list = await prisma.briefing.findMany({
    orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    take: 50,
  })
  res.json(list)
})

r.get('/briefings/latest', async (req, res) => {
  const b = await prisma.briefing.findFirst({
    orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
  })
  res.json(b || null)
})

// ─── Fascicolo / Dossier ───
r.get('/dossier', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      decorations: { include: { decoration: true }, orderBy: { awardedAt: 'desc' } },
      serviceLog: { orderBy: { occurredAt: 'desc' }, take: 100 },
    },
  })
  if (!user) return res.status(404).json({ error: 'not found' })

  const matricola = user.matricola || generateMatricola(user.id)
  const enlistedAt = user.enlistedAt || user.approvedAt || user.createdAt
  const daysOfService = Math.floor((Date.now() - new Date(enlistedAt).getTime()) / 86400000)
  const lore = GRADE_LORE[user.rank] || GRADE_LORE.Caporale

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    matricola,
    rank: user.rank,
    lore,
    enlistedAt,
    daysOfService,
    purchaseCount: user.purchaseCount || 0,
    decorations: user.decorations.map(d => ({
      id: d.id,
      slug: d.decoration.slug,
      name: d.decoration.name,
      iconKey: d.decoration.iconKey,
      rarity: d.decoration.rarity,
      awardedAt: d.awardedAt,
      reason: d.reason,
    })),
    serviceLog: user.serviceLog,
  })
})

// ─── Notifiche ───
r.get('/notifications', async (req, res) => {
  const list = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  res.json(list)
})

r.get('/notifications/unread-count', async (req, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user.id, readAt: null },
  })
  res.json({ count })
})

r.post('/notifications/:id/read', async (req, res) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id, userId: req.user.id },
      data: { readAt: new Date() },
    })
    res.json({ ok: true })
  } catch (e) { res.status(404).json({ error: 'not found' }) }
})

r.post('/notifications/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  })
  res.json({ ok: true })
})

// ─── Cerimonie ───
r.get('/ceremonies/pending', async (req, res) => {
  const c = await prisma.ceremony.findFirst({
    where: { userId: req.user.id, acknowledgedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  res.json(c || null)
})

r.post('/ceremonies/:id/acknowledge', async (req, res) => {
  try {
    await prisma.ceremony.update({
      where: { id: req.params.id, userId: req.user.id },
      data: { acknowledgedAt: new Date() },
    })
    res.json({ ok: true })
  } catch (e) { res.status(404).json({ error: 'not found' }) }
})

// ─── Albo d'Onore (organico aggregato + roster anonimizzato) ───
r.get('/albo-onore', async (req, res) => {
  const all = await prisma.user.findMany({
    where: { role: 'TRADER', approved: true },
    select: {
      rank: true,
      matricola: true,
      enlistedAt: true,
      showInAlbo: true,
      decorations: { select: { decorationId: true } },
    },
  })

  const counts = { Caporale: 0, Sergente: 0, Capitano: 0, Colonnello: 0 }
  for (const u of all) counts[u.rank] = (counts[u.rank] || 0) + 1

  // Roster: solo chi ha optato per essere visibile (anonimizzato a matricola)
  const roster = all
    .filter(u => u.showInAlbo)
    .map(u => {
      const days = u.enlistedAt ? Math.floor((Date.now() - new Date(u.enlistedAt).getTime()) / 86400000) : 0
      return {
        matricola: u.matricola || 'VLT-????',
        rank: u.rank,
        daysOfService: days,
        decorationsCount: u.decorations.length,
      }
    })
    .sort((a, b) => b.daysOfService - a.daysOfService)

  res.json({
    totalActive: all.length,
    byRank: counts,
    roster,
  })
})

// ─── Profilo personale: opzioni ───
r.patch('/profile', async (req, res) => {
  try {
    const data = z.object({
      showInAlbo: z.boolean().optional(),
    }).parse(req.body)
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, showInAlbo: true },
    })
    res.json(user)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ─── Documenti ───
r.get('/documents', async (req, res) => {
  const docs = await prisma.document.findMany({
    where: { userId: req.user.id },
    orderBy: { uploadedAt: 'desc' },
  })
  res.json(docs)
})

r.post('/documents/:id/sign', async (req, res) => {
  try {
    const doc = await prisma.document.update({
      where: { id: req.params.id, userId: req.user.id },
      data: { signed: true, signedAt: new Date() },
    })
    await prisma.serviceLogEntry.create({
      data: {
        userId: req.user.id,
        type: 'document',
        title: `Documento firmato: ${doc.title}`,
        body: 'Firma confermata dal membro.',
        iconKey: '📄',
      },
    }).catch(() => {})
    res.json({ ok: true })
  } catch (e) { res.status(404).json({ error: 'not found' }) }
})

export default r
