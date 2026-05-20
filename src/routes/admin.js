import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin } from '../lib/middleware.js'
import { getAllSettings, setSetting } from '../lib/settings.js'
import { sendApprovalEmail } from '../lib/email.js'

const r = Router()
r.use(requireAuth, requireAdmin)

// ── Settings ──
r.get('/settings', async (req, res) => res.json(await getAllSettings()))

r.put('/settings/:key', async (req, res) => {
  try {
    const { value, isPublic } = z.object({ value: z.string(), isPublic: z.boolean().optional() }).parse(req.body)
    res.json(await setSetting(req.params.key, value, isPublic ?? false))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/settings/bulk', async (req, res) => {
  try {
    const items = z.array(z.object({ key: z.string(), value: z.string(), isPublic: z.boolean().optional() })).parse(req.body)
    for (const it of items) await setSetting(it.key, it.value, it.isPublic ?? false)
    res.json({ ok: true, count: items.length })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Programs ──
r.get('/programs', async (req, res) => {
  const programs = await prisma.program.findMany({ orderBy: { accountSize: 'asc' } })
  res.json(programs)
})

r.post('/programs', async (req, res) => {
  try {
    const data = z.object({
      name: z.string(),
      accountSize: z.number().positive(),
      phase: z.enum(['CHALLENGE', 'VERIFICATION', 'FUNDED', 'INSTANT']),
      profitTargetPct: z.number().optional().nullable(),
      maxDailyLossPct: z.number().positive(),
      maxOverallLossPct: z.number().positive(),
      minTradingDays: z.number().int().optional().nullable(),
      profitSplitPct: z.number().positive(),
      payoutFrequencyDays: z.number().int().default(7).optional(),
      scalpingAllowed: z.boolean().optional(),
      newsAllowed: z.boolean().optional(),
      weekendHoldAllowed: z.boolean().optional(),
      priceUsd: z.number().optional().nullable(),
      activationFeeUsd: z.number().optional().nullable(),
      active: z.boolean().optional(),
    }).parse(req.body)
    res.json(await prisma.program.create({ data }))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.patch('/programs/:id', async (req, res) => {
  try {
    res.json(await prisma.program.update({ where: { id: req.params.id }, data: req.body }))
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/programs/:id', async (req, res) => {
  try {
    await prisma.program.update({ where: { id: req.params.id }, data: { active: false } })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Accounts ──
r.get('/accounts', async (req, res) => {
  const accounts = await prisma.propAccount.findMany({
    include: { user: { select: { id: true, name: true, email: true } }, program: true },
    orderBy: { startedAt: 'desc' },
  })
  res.json(accounts)
})

r.post('/accounts', async (req, res) => {
  try {
    const data = z.object({
      userId: z.string(),
      programId: z.string(),
      brokerLogin: z.string(),
      broker: z.string().default('cTrader'),
      startBalance: z.number().positive(),
    }).parse(req.body)
    const account = await prisma.propAccount.create({ data })
    await prisma.auditLog.create({
      data: { actorId: req.user.id, entity: 'PropAccount', entityId: account.id, action: 'CREATE', after: account },
    })
    res.json(account)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.patch('/accounts/:id', async (req, res) => {
  try {
    const data = z.object({
      status: z.enum(['ACTIVE', 'PASSED', 'FAILED', 'PAID_OUT']).optional(),
      failureReason: z.string().optional().nullable(),
      endedAt: z.coerce.date().optional().nullable(),
      startBalance: z.number().positive().optional(),
      programId: z.string().optional(),
      brokerLogin: z.string().optional(),
      broker: z.string().optional(),
      notes: z.string().optional().nullable(),
    }).parse(req.body)
    const before = await prisma.propAccount.findUnique({ where: { id: req.params.id } })
    const account = await prisma.propAccount.update({ where: { id: req.params.id }, data })
    await prisma.auditLog.create({
      data: { actorId: req.user.id, entity: 'PropAccount', entityId: account.id, action: 'UPDATE', before, after: account },
    })
    res.json(account)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/accounts/:id', async (req, res) => {
  try {
    await prisma.propAccount.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Snapshots ──
r.post('/snapshots', async (req, res) => {
  try {
    const SnapshotSchema = z.object({
      accountId: z.string(),
      date: z.coerce.date(),
      balance: z.number().positive(),
      equity: z.number().positive(),
      trades: z.number().int().nonnegative().optional().nullable(),
      volume: z.number().nonnegative().optional().nullable(),
      bestTrade: z.number().optional().nullable(),
      worstTrade: z.number().optional().nullable(),
      avgWin: z.number().optional().nullable(),
      avgLoss: z.number().optional().nullable(),
      winRatePct: z.number().min(0).max(100).optional().nullable(),
      profitFactor: z.number().nonnegative().optional().nullable(),
      notes: z.string().optional().nullable(),
    })
    const items = Array.isArray(req.body) ? req.body : [req.body]
    const results = []
    for (const item of items) {
      const data = SnapshotSchema.parse(item)
      const account = await prisma.propAccount.findUnique({
        where: { id: data.accountId },
        include: { snapshots: { orderBy: { date: 'desc' }, take: 1 } },
      })
      if (!account) continue
      const startBalance = Number(account.startBalance)
      const prev = account.snapshots[0]
      const prevBalance = prev ? Number(prev.balance) : startBalance
      const dailyPL = data.balance - prevBalance
      const drawdownPct = ((startBalance - data.equity) / startBalance) * 100

      // Remove null/undefined to avoid Prisma issues
      const clean = {}
      for (const k of Object.keys(data)) {
        if (data[k] !== null && data[k] !== undefined) clean[k] = data[k]
      }

      const snapshot = await prisma.dailySnapshot.upsert({
        where: { accountId_date: { accountId: data.accountId, date: data.date } },
        update: { ...clean, dailyPL, drawdownPct, enteredBy: req.user.id },
        create: { ...clean, dailyPL, drawdownPct, enteredBy: req.user.id },
      })
      results.push(snapshot)
    }
    res.json(results)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/snapshots/:id', async (req, res) => {
  try {
    await prisma.dailySnapshot.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Users ──
r.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    where: { role: 'TRADER' },
    select: {
      id: true, name: true, email: true, emailVerified: true, approved: true, approvedAt: true, createdAt: true,
      rank: true, purchaseCount: true,
      propAccounts: { select: { id: true, status: true, startBalance: true, program: { select: { name: true } } } },
      _count: { select: { payoutRequests: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(users)
})

r.post('/users/:id/approve', async (req, res) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!target) return res.status(404).json({ error: 'not found' })

    const now = new Date()
    const matricola = target.matricola || `VLT-${target.id.slice(-4).toUpperCase()}`

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        approved: true,
        approvedAt: now,
        matricola: target.matricola || matricola,
        enlistedAt: target.enlistedAt || now,
        rank: target.rank || 'Caporale',
      },
    })

    // Service log - arruolamento
    await prisma.serviceLogEntry.create({
      data: {
        userId: user.id,
        type: 'enlistment',
        title: 'Arruolamento',
        body: `Ammissione confermata. Matricola ${matricola} assegnata. Grado iniziale: ${user.rank}.`,
        iconKey: 'flag',
      },
    }).catch(() => {})

    // Cerimonia di Imposizione dei Gradi
    await prisma.ceremony.create({
      data: {
        userId: user.id,
        type: 'enlistment',
        payload: { rank: user.rank, matricola },
      },
    }).catch(() => {})

    // Notifica
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'enlistment',
        title: `Benvenuto al grado di ${user.rank}`,
        body: `Matricola ${matricola} attiva.`,
        url: '/dashboard',
      },
    }).catch(() => {})

    sendApprovalEmail(user.email, user.name).catch(() => {})
    res.json({ ok: true, user })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/users/:id/revoke', async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { approved: false, approvedAt: null },
    })
    res.json({ ok: true, user })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// User detail with EVERYTHING
r.get('/users/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, email: true, role: true, emailVerified: true,
        kycVerifiedAt: true, telegramChatId: true, notes: true, createdAt: true,
        rank: true, matricola: true, enlistedAt: true, approved: true, approvedAt: true,
        email2faEnabled: true, purchaseCount: true,
        propAccounts: {
          include: {
            program: true,
            snapshots: { orderBy: { date: 'desc' }, take: 30 },
            _count: { select: { snapshots: true } },
          },
          orderBy: { startedAt: 'desc' },
        },
        payoutRequests: {
          include: { account: { include: { program: true } } },
          orderBy: { requestedAt: 'desc' },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
        },
        serviceLog: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        decorations: {
          include: { decoration: true },
          orderBy: { awardedAt: 'desc' },
        },
      },
    })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user)
  } catch (e) {
    console.error('[admin/users/:id]', e.message)
    res.status(500).json({ error: e.message })
  }
})

r.patch('/users/:id', async (req, res) => {
  try {
    const data = z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      emailVerified: z.boolean().optional(),
      kycVerifiedAt: z.coerce.date().optional().nullable(),
      telegramChatId: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }).parse(req.body)
    const user = await prisma.user.update({ where: { id: req.params.id }, data })
    res.json(user)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/users/:id', async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Adjust operation counter (manual override / correction)
r.post('/users/:id/set-purchases', async (req, res) => {
  try {
    const { count } = z.object({ count: z.number().int().min(0).max(99999) }).parse(req.body)
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { purchaseCount: count },
      select: { purchaseCount: true },
    })
    res.json(user)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Orders (promozioni in attesa di approvazione) ──
r.get('/orders', async (req, res) => {
  const { status } = req.query
  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, email: true, matricola: true, rank: true } },
    },
  })
  res.json(orders)
})

r.get('/orders/:id', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true, matricola: true, rank: true } },
    },
  })
  if (!order) return res.status(404).json({ error: 'Ordine non trovato' })
  res.json(order)
})

async function approveOrderLogic(orderId, decidedBy) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Ordine non trovato')
  if (order.status !== 'PENDING') throw new Error('Ordine già processato')

  const program = await prisma.program.findUnique({ where: { id: order.programId } })

  // Promuovi il membro al grado richiesto
  await prisma.user.update({
    where: { id: order.userId },
    data: {
      rank: program?.name || order.programName,
      purchaseCount: { increment: 1 },
    },
  })

  // Aggiorna ordine
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'APPROVED', decidedAt: new Date(), decidedBy: decidedBy || 'admin' },
  })

  // Entry registro di servizio
  await prisma.serviceLogEntry.create({
    data: {
      userId: order.userId,
      type: 'promotion',
      title: `Promosso a ${order.programName}`,
      description: `Versamento ${order.amount} ${order.currency} verificato. Approvato dal Comando.`,
    },
  }).catch(() => {})

  return order
}

r.post('/orders/:id/approve', async (req, res) => {
  try {
    await approveOrderLogic(req.params.id, req.user?.email)
    res.json({ message: 'Promozione approvata e grado attivato.' })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/orders/:id/reject', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } })
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' })
    if (order.status !== 'PENDING') return res.status(400).json({ error: 'Ordine già processato' })
    await prisma.order.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', decidedAt: new Date(), decidedBy: req.user?.email || 'admin' },
    })
    await prisma.serviceLogEntry.create({
      data: {
        userId: order.userId,
        type: 'note',
        title: `Richiesta ${order.programName} rifiutata`,
        description: 'Versamento non verificato dal Comando.',
      },
    }).catch(() => {})
    res.json({ message: 'Ordine rifiutato.' })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Account snapshots history (for admin view)
r.get('/accounts/:id/snapshots', async (req, res) => {
  const snapshots = await prisma.dailySnapshot.findMany({
    where: { accountId: req.params.id },
    orderBy: { date: 'desc' },
  })
  res.json(snapshots)
})

// ── Payouts ──
r.get('/payouts', async (req, res) => {
  const { status } = req.query
  const payouts = await prisma.payoutRequest.findMany({
    where: status ? { status } : {},
    include: { user: { select: { name: true, email: true } }, account: { include: { program: true } } },
    orderBy: { requestedAt: 'desc' },
  })
  res.json(payouts)
})

r.patch('/payouts/:id', async (req, res) => {
  try {
    const data = z.object({
      status: z.enum(['APPROVED', 'PAID', 'REJECTED']),
      txHash: z.string().optional(),
      rejectionReason: z.string().optional(),
    }).parse(req.body)
    const payout = await prisma.payoutRequest.update({
      where: { id: req.params.id },
      data: { ...data, processedAt: new Date() },
    })
    res.json(payout)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ─── Briefings (Sala Briefing) ───
r.get('/briefings', async (req, res) => {
  const list = await prisma.briefing.findMany({ orderBy: { publishedAt: 'desc' } })
  res.json(list)
})

r.post('/briefings', async (req, res) => {
  try {
    const data = z.object({
      type: z.enum(['ordine_del_giorno', 'comunicazione', 'encomio', 'ricorrenza']).default('ordine_del_giorno'),
      title: z.string().min(3),
      body: z.string().min(3),
      pinned: z.boolean().optional(),
    }).parse(req.body)
    const briefing = await prisma.briefing.create({
      data: { ...data, authorId: req.user.id },
    })

    // Notifica tutti gli utenti approvati
    const users = await prisma.user.findMany({
      where: { role: 'TRADER', approved: true },
      select: { id: true },
    })
    if (users.length > 0) {
      await prisma.notification.createMany({
        data: users.map(u => ({
          userId: u.id,
          type: 'briefing',
          title: 'Nuovo Ordine del Giorno',
          body: briefing.title,
          url: '/briefing',
        })),
      })
    }
    res.json(briefing)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.patch('/briefings/:id', async (req, res) => {
  try {
    const data = z.object({
      title: z.string().optional(),
      body: z.string().optional(),
      pinned: z.boolean().optional(),
    }).parse(req.body)
    const b = await prisma.briefing.update({ where: { id: req.params.id }, data })
    res.json(b)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/briefings/:id', async (req, res) => {
  try {
    await prisma.briefing.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ─── Decorations ───
r.get('/decorations', async (req, res) => {
  const list = await prisma.decoration.findMany({ orderBy: { name: 'asc' } })
  res.json(list)
})

r.post('/decorations/award', async (req, res) => {
  try {
    const { decorationId, userId, reason } = z.object({
      decorationId: z.string(),
      userId: z.string(),
      reason: z.string().optional(),
    }).parse(req.body)

    const decoration = await prisma.decoration.findUnique({ where: { id: decorationId } })
    if (!decoration) return res.status(404).json({ error: 'Decorazione non trovata' })

    const award = await prisma.decorationAward.create({
      data: { decorationId, userId, reason },
    })

    // Service log entry
    await prisma.serviceLogEntry.create({
      data: {
        userId,
        type: 'decoration',
        title: `Conferimento: ${decoration.name}`,
        body: reason || decoration.criterion,
        iconKey: decoration.iconKey,
      },
    })

    // Notifica al destinatario
    await prisma.notification.create({
      data: {
        userId,
        type: 'decoration',
        title: 'Decorazione conferita',
        body: decoration.name,
        url: '/personale',
      },
    })

    res.json(award)
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Decorazione già conferita a questo membro' })
    res.status(400).json({ error: e.message })
  }
})

// ─── Promozioni di grado ───
r.post('/users/:id/promote', async (req, res) => {
  try {
    const { rank, reason } = z.object({
      rank: z.enum(['Caporale', 'Sergente', 'Capitano', 'Colonnello']),
      reason: z.string().optional(),
    }).parse(req.body)

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { rank },
    })

    // Service log
    await prisma.serviceLogEntry.create({
      data: {
        userId: user.id,
        type: 'promotion',
        title: `Promozione a ${rank}`,
        body: reason || `Avanzamento al grado di ${rank} disposto dal Comando.`,
        iconKey: 'rank',
      },
    })

    // Cerimonia pending
    await prisma.ceremony.create({
      data: {
        userId: user.id,
        type: 'promotion',
        payload: { rank, reason: reason || null },
      },
    })

    // Notifica
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'promotion',
        title: 'Promozione disposta',
        body: `Il Comando ha disposto il Suo avanzamento al grado di ${rank}.`,
        url: '/dashboard',
      },
    })

    res.json({ ok: true, user })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ─── Service log entry manuale ───
r.post('/users/:id/log', async (req, res) => {
  try {
    const data = z.object({
      type: z.string().default('note'),
      title: z.string(),
      body: z.string().optional(),
      iconKey: z.string().default('note'),
    }).parse(req.body)
    const entry = await prisma.serviceLogEntry.create({
      data: { ...data, userId: req.params.id },
    })
    res.json(entry)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ─── Admin: forza 2FA email per un utente ───
r.post('/users/:id/email-2fa', async (req, res) => {
  try {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body)
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { email2faEnabled: enabled, email2faCode: null, email2faExpiry: null },
    })
    // Notifica all'utente
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'security',
        title: enabled ? 'Verifica via email attivata' : 'Verifica via email disattivata',
        body: enabled ? 'Il Comando ha attivato la verifica via email sul tuo account. Al prossimo accesso riceverai un codice.' : 'La verifica via email è stata disattivata.',
        url: '/sicurezza-accesso',
      },
    }).catch(() => {})
    await prisma.serviceLogEntry.create({
      data: {
        userId: user.id,
        type: 'security',
        title: enabled ? 'Verifica email attivata dal Comando' : 'Verifica email disattivata dal Comando',
        body: enabled ? 'Verifica in due passaggi imposta come obbligatoria.' : 'Verifica in due passaggi rimossa.',
        iconKey: '🔒',
      },
    }).catch(() => {})
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ─── Documenti admin ───
r.get('/users/:id/documents', async (req, res) => {
  const docs = await prisma.document.findMany({
    where: { userId: req.params.id },
    orderBy: { uploadedAt: 'desc' },
  })
  res.json(docs)
})

r.post('/users/:id/documents', async (req, res) => {
  try {
    const data = z.object({
      category: z.string().default('contract'),
      title: z.string().min(2),
      description: z.string().optional(),
      fileUrl: z.string().optional(),
    }).parse(req.body)

    const doc = await prisma.document.create({
      data: { ...data, userId: req.params.id, uploadedBy: req.user.id },
    })

    await prisma.notification.create({
      data: {
        userId: req.params.id,
        type: 'document',
        title: 'Nuovo documento disponibile',
        body: doc.title,
        url: '/documenti',
      },
    }).catch(() => {})

    res.json(doc)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/documents/:id', async (req, res) => {
  try {
    await prisma.document.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ─── Coupon ───
r.get('/coupons', async (req, res) => {
  const list = await prisma.coupon.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { redemptions: true } } },
  })
  res.json(list)
})

r.post('/coupons', async (req, res) => {
  try {
    const data = z.object({
      code: z.string().min(3).max(32),
      description: z.string().optional(),
      discountType: z.enum(['percent', 'fixed']).default('percent'),
      discountValue: z.number().positive(),
      maxUses: z.number().int().positive().optional(),
      validUntil: z.string().optional(),
      programId: z.string().optional(),
      active: z.boolean().default(true),
    }).parse(req.body)
    const coupon = await prisma.coupon.create({
      data: {
        ...data,
        code: data.code.toUpperCase().trim(),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        createdBy: req.user.id,
      },
    })
    res.json(coupon)
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Codice già esistente.' })
    res.status(400).json({ error: e.message })
  }
})

r.patch('/coupons/:id', async (req, res) => {
  try {
    const data = z.object({
      description: z.string().optional(),
      active: z.boolean().optional(),
      maxUses: z.number().int().positive().nullable().optional(),
      validUntil: z.string().nullable().optional(),
    }).parse(req.body)
    const update = { ...data }
    if (data.validUntil !== undefined) update.validUntil = data.validUntil ? new Date(data.validUntil) : null
    const coupon = await prisma.coupon.update({ where: { id: req.params.id }, data: update })
    res.json(coupon)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.delete('/coupons/:id', async (req, res) => {
  try {
    await prisma.coupon.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.get('/coupons/:id/redemptions', async (req, res) => {
  const reds = await prisma.couponRedemption.findMany({
    where: { couponId: req.params.id },
    orderBy: { redeemedAt: 'desc' },
  })
  // Manual join con users
  const userIds = [...new Set(reds.map(r => r.userId))]
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
  const map = Object.fromEntries(users.map(u => [u.id, u]))
  res.json(reds.map(r => ({ ...r, user: map[r.userId] })))
})

// ─── Audit Log esposto ───
r.get('/audit-log', async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { actor: { select: { id: true, name: true, email: true } } },
  })
  res.json(logs)
})

// ─── Analytics organico ───
r.get('/analytics', async (req, res) => {
  const since = new Date(Date.now() - 365 * 86400000)

  // Crescita mensile organico
  const users = await prisma.user.findMany({
    where: { role: 'TRADER', approved: true, approvedAt: { gte: since } },
    select: { approvedAt: true, rank: true },
  })
  const growthMap = {}
  for (const u of users) {
    if (!u.approvedAt) continue
    const k = `${u.approvedAt.getFullYear()}-${String(u.approvedAt.getMonth() + 1).padStart(2, '0')}`
    growthMap[k] = (growthMap[k] || 0) + 1
  }
  const growth = Object.entries(growthMap).sort().map(([month, count]) => ({ month, count }))

  // Briefing per mese
  const briefings = await prisma.briefing.findMany({
    where: { publishedAt: { gte: since } },
    select: { publishedAt: true, type: true },
  })
  const briefMap = {}
  for (const b of briefings) {
    const k = `${b.publishedAt.getFullYear()}-${String(b.publishedAt.getMonth() + 1).padStart(2, '0')}`
    briefMap[k] = (briefMap[k] || 0) + 1
  }
  const briefingsPerMonth = Object.entries(briefMap).sort().map(([month, count]) => ({ month, count }))

  // Decorazioni conferite
  const decoCount = await prisma.decorationAward.count({ where: { awardedAt: { gte: since } } })
  // Per tipo
  const decoByType = await prisma.decorationAward.findMany({
    where: { awardedAt: { gte: since } },
    include: { decoration: { select: { name: true, slug: true } } },
  })
  const decoBySlug = {}
  for (const d of decoByType) {
    decoBySlug[d.decoration.slug] = (decoBySlug[d.decoration.slug] || 0) + 1
  }

  // Stats correnti
  const allActive = await prisma.user.findMany({
    where: { role: 'TRADER', approved: true },
    select: { rank: true, enlistedAt: true },
  })
  const totals = { Caporale: 0, Sergente: 0, Capitano: 0, Colonnello: 0 }
  let totalDays = 0
  for (const u of allActive) {
    totals[u.rank] = (totals[u.rank] || 0) + 1
    if (u.enlistedAt) totalDays += Math.floor((Date.now() - u.enlistedAt.getTime()) / 86400000)
  }
  const avgAnzianita = allActive.length > 0 ? Math.round(totalDays / allActive.length) : 0

  // Coupon usage
  const coupons = await prisma.coupon.findMany({
    include: { _count: { select: { redemptions: true } } },
    orderBy: { usedCount: 'desc' },
    take: 10,
  })

  res.json({
    growth,
    briefingsPerMonth,
    decorations: { total: decoCount, bySlug: decoBySlug },
    organico: { totale: allActive.length, byRank: totals, avgAnzianita },
    topCoupons: coupons.map(c => ({ code: c.code, used: c.usedCount, max: c.maxUses })),
  })
})

// ─── Export Albo (JSON, da convertire in CSV lato client) ───
r.get('/export-albo', async (req, res) => {
  const users = await prisma.user.findMany({
    where: { role: 'TRADER', approved: true },
    select: {
      matricola: true, name: true, email: true, rank: true,
      enlistedAt: true, approvedAt: true, kycVerifiedAt: true,
      email2faEnabled: true, showInAlbo: true,
      _count: { select: { decorations: true, propAccounts: true } },
    },
    orderBy: { enlistedAt: 'asc' },
  })
  res.json(users.map(u => ({
    matricola: u.matricola || '—',
    nome: u.name,
    email: u.email,
    grado: u.rank,
    arruolato: u.enlistedAt ? u.enlistedAt.toISOString().slice(0, 10) : '—',
    anzianita: u.enlistedAt ? Math.floor((Date.now() - u.enlistedAt.getTime()) / 86400000) : 0,
    kyc: u.kycVerifiedAt ? 'sì' : 'no',
    twoFA: u.email2faEnabled ? 'sì' : 'no',
    visibile: u.showInAlbo ? 'sì' : 'no',
    decorazioni: u._count.decorations,
    accounts: u._count.propAccounts,
  })))
})

export default r
