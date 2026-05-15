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
  // Fallback retrocompatibile
  if (wallets.length === 0) {
    const address = await getSetting('PAYMENT_ADDRESS', process.env.PAYMENT_ADDRESS || '')
    const network = await getSetting('PAYMENT_NETWORK', process.env.PAYMENT_NETWORK || 'USDT TRC20')
    if (address) wallets.push({ network: 'USDT_TRC20', label: network, address })
  }
  res.json({ wallets })
})

r.post('/request', requireAuth, async (req, res) => {
  try {
    const { programId, network, txHash } = z.object({
      programId: z.string(),
      network: z.string().optional(),
      txHash: z.string().optional(),
    }).parse(req.body)

    const program = await prisma.program.findUnique({ where: { id: programId } })
    if (!program) return res.status(404).json({ error: 'Grado non trovato' })

    notifyPurchaseReceipt({ user: req.user, program, receiptUrl: txHash, network }).catch(() => {})

    res.json({
      message: 'Richiesta trasmessa al Comando. Verifica del pagamento entro 24 ore.',
    })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

export default r
