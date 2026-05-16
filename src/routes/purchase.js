import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/middleware.js'
import { getSetting } from '../lib/settings.js'
import { notifyPurchaseReceipt } from '../lib/telegram.js'

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
    const { programId, network, txHash, couponCode } = z.object({
      programId: z.string(),
      network: z.string().optional(),
      txHash: z.string().optional(),
      couponCode: z.string().optional(),
    }).parse(req.body)

    const program = await prisma.program.findUnique({ where: { id: programId } })
    if (!program) return res.status(404).json({ error: 'Grado non trovato' })

    let couponInfo = null
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase().trim() } })
      if (coupon && coupon.active) {
        try {
          await prisma.couponRedemption.create({
            data: {
              couponId: coupon.id,
              userId: req.user.id,
              programId,
              amountOff: 0,
            },
          })
          await prisma.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } },
          })
          couponInfo = coupon.code
        } catch (e) {}
      }
    }

    notifyPurchaseReceipt({ user: req.user, program, receiptUrl: txHash, network, coupon: couponInfo }).catch(() => {})

    res.json({
      message: 'Richiesta trasmessa al Comando. Verifica del pagamento entro 24 ore.',
    })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

export default r
