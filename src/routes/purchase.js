import { Router } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/middleware.js'
import { getSetting } from '../lib/settings.js'
import { notifyPurchaseReceipt, notifyOrderApproval, notifyMember } from '../lib/telegram.js'

const r = Router()

r.get('/programs', async (req, res) => {
  const programs = await prisma.program.findMany({
    where: { active: true },
    orderBy: [{ phase: 'asc' }, { accountSize: 'asc' }],
  })
  res.json(programs)
})

r.get('/payment-info', async (req, res) => {
  const networks = [
    { value: 'USDT_TRC20', label: 'USDT (TRC20 - Tron)', settingKey: 'PAYMENT_USDT_TRC20' },
    { value: 'USDT_ERC20', label: 'USDT (ERC20 - Ethereum)', settingKey: 'PAYMENT_USDT_ERC20' },
    { value: 'USDC_ERC20', label: 'USDC (ERC20 - Ethereum)', settingKey: 'PAYMENT_USDC_ERC20' },
    { value: 'USDC_SOLANA', label: 'USDC (Solana)', settingKey: 'PAYMENT_USDC_SOLANA' },
    { value: 'BTC', label: 'Bitcoin', settingKey: 'PAYMENT_BTC' },
    { value: 'ETH', label: 'Ethereum', settingKey: 'PAYMENT_ETH' },
  ]
  const wallets = []
  for (const n of networks) {
    const addr = await getSetting(n.settingKey, '')
    if (addr) wallets.push({ network: n.value, label: n.label, address: addr })
  }
  if (wallets.length === 0) {
    const address = await getSetting('PAYMENT_ADDRESS', process.env.PAYMENT_ADDRESS || '')
    const network = await getSetting('PAYMENT_NETWORK', process.env.PAYMENT_NETWORK || 'USDT TRC20')
    if (address) wallets.push({ network: 'USDT_TRC20', label: network, address })
  }
  const telegramUrl = await getSetting('TELEGRAM_PAYMENTS_URL', '') || await getSetting('TELEGRAM_SUPPORT_URL', '')
  const telegramHandle = await getSetting('TELEGRAM_PAYMENTS_HANDLE', '') || await getSetting('TELEGRAM_SUPPORT_HANDLE', '')
  res.json({ wallets, telegramUrl, telegramHandle })
})

r.post('/validate-coupon', requireAuth, async (req, res) => {
  try {
    const { code, programId } = z.object({
      code: z.string(),
      programId: z.string(),
    }).parse(req.body)

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase().trim() },
    })
    if (!coupon || !coupon.active) return res.status(404).json({ error: 'Coupon non valido.' })
    if (coupon.validUntil && coupon.validUntil < new Date()) return res.status(400).json({ error: 'Coupon scaduto.' })
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: 'Coupon esaurito.' })
    if (coupon.programId && coupon.programId !== programId) return res.status(400).json({ error: 'Coupon non applicabile a questo grado.' })

    // Una redemption per utente max
    const existing = await prisma.couponRedemption.findUnique({
      where: { couponId_userId: { couponId: coupon.id, userId: req.user.id } },
    }).catch(() => null)
    if (existing) return res.status(400).json({ error: 'Coupon già utilizzato.' })

    const program = await prisma.program.findUnique({ where: { id: programId } })
    if (!program) return res.status(404).json({ error: 'Grado non trovato.' })

    const price = Number(program.priceUsd || 0)
    let discount = 0
    if (coupon.discountType === 'percent') discount = price * (Number(coupon.discountValue) / 100)
    else discount = Number(coupon.discountValue)
    discount = Math.min(discount, price)
    const finalPrice = Math.max(0, price - discount)

    res.json({
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      originalPrice: price,
      discount,
      finalPrice,
    })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

r.post('/request', requireAuth, async (req, res) => {
  try {
    const { programId, network, txHash, couponCode, receiptUrl } = z.object({
      programId: z.string(),
      network: z.string().optional(),
      txHash: z.string().optional(),
      couponCode: z.string().optional(),
      receiptUrl: z.string().optional(),
    }).parse(req.body)

    const program = await prisma.program.findUnique({ where: { id: programId } })
    if (!program) return res.status(404).json({ error: 'Grado non trovato' })

    let couponInfo = null
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase().trim() } })
      if (coupon && coupon.active) {
        try {
          await prisma.couponRedemption.create({
            data: { couponId: coupon.id, userId: req.user.id, programId, amountOff: 0 },
          })
          await prisma.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } },
          })
          couponInfo = coupon.code
        } catch (e) {}
      }
    }

    // Crea Order in stato PENDING con token di approvazione univoco
    const approvalToken = crypto.randomBytes(24).toString('hex')
    const order = await prisma.order.create({
      data: {
        userId: req.user.id,
        programId,
        programName: program.name,
        amount: Number(program.priceUsd || 0),
        currency: 'USDT',
        network: network || null,
        txHash: txHash || null,
        receiptUrl: receiptUrl || null,
        couponCode: couponInfo,
        status: 'PENDING',
        approvalToken,
      },
    })

    // Entry registro di servizio
    try {
      await prisma.serviceLogEntry.create({
        data: {
          userId: req.user.id,
          type: 'purchase',
          title: `Richiesta promozione — ${program.name}`,
          body: txHash ? `TxHash: ${txHash} · In attesa di verifica` : 'In attesa di verifica',
          iconKey: 'star',
        },
      })
    } catch (e) {}

    // Notifica Telegram con link approvazione diretto
    const base = process.env.PUBLIC_URL || 'https://voltrasolutions.com'
    const approveUrl = `${base}/admin/approva/${order.id}?token=${approvalToken}`
    const profileUrl = `${base}/admin/utente/${req.user.id}`
    notifyOrderApproval({
      user: req.user,
      order,
      approveUrl,
      profileUrl,
    }).catch(() => {})

    res.json({
      message: 'Richiesta trasmessa al Comando. Verifica del pagamento entro 24 ore.',
      orderId: order.id,
      status: 'PENDING',
    })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Stato ordine per l'utente (pagina "in attesa")
r.get('/order/:id', requireAuth, async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } })
  if (!order || order.userId !== req.user.id) return res.status(404).json({ error: 'Ordine non trovato' })
  res.json({
    id: order.id,
    programName: order.programName,
    amount: order.amount,
    currency: order.currency,
    network: order.network,
    status: order.status,
    createdAt: order.createdAt,
  })
})

// Approvazione rapida via token (link Telegram) — verifica ordine + token
r.get('/approve-info/:id', async (req, res) => {
  const { token } = req.query
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { name: true, email: true, matricola: true, rank: true } } },
  })
  if (!order || !token || order.approvalToken !== token) {
    return res.status(403).json({ error: 'Link non valido o scaduto' })
  }
  res.json({ order })
})

r.post('/approve/:id', async (req, res) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body)
    const order = await prisma.order.findUnique({ where: { id: req.params.id } })
    if (!order || order.approvalToken !== token) {
      return res.status(403).json({ error: 'Link non valido' })
    }
    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: 'Ordine già processato', status: order.status })
    }

    const program = await prisma.program.findUnique({ where: { id: order.programId } })
    await prisma.user.update({
      where: { id: order.userId },
      data: { rank: program?.name || order.programName, purchaseCount: { increment: 1 } },
    })

    // Crea la dotazione operativa (PropAccount) se non già presente per questo programma
    if (program) {
      const existing = await prisma.propAccount.findFirst({
        where: { userId: order.userId, programId: program.id, status: 'ACTIVE' },
      })
      if (!existing) {
        await prisma.propAccount.create({
          data: {
            userId: order.userId,
            programId: program.id,
            brokerLogin: 'DA ASSEGNARE',
            broker: 'cTrader',
            startBalance: program.accountSize,
            status: 'ACTIVE',
          },
        }).catch(() => {})
      }
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'APPROVED', decidedAt: new Date(), decidedBy: 'telegram', approvalToken: null },
    })
    await prisma.serviceLogEntry.create({
      data: {
        userId: order.userId,
        type: 'promotion',
        title: `Promosso a ${order.programName}`,
        body: `Versamento ${order.amount} ${order.currency} verificato. Approvato dal Comando.`,
        iconKey: 'star',
      },
    }).catch(() => {})

    // Notifica il membro su Telegram se collegato
    const member = await prisma.user.findUnique({ where: { id: order.userId }, select: { telegramChatId: true, name: true } })
    if (member?.telegramChatId) {
      notifyMember(member.telegramChatId,
        `🎖 <b>Promozione approvata</b>\n\n` +
        `Complimenti, <b>${member.name}</b>.\n` +
        `Sei stato promosso a <b>${order.programName}</b>.\n\n` +
        `La tua missione è ora attiva. Accedi al Quartier Generale su voltrasolutions.com.`
      ).catch(() => {})
    }

    res.json({ message: 'Promozione approvata. Grado attivato.', programName: order.programName })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

export default r
