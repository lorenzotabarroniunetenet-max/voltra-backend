import { prisma } from '../../lib/prisma.js'
import { payoutsListKeyboard, payoutDetailKeyboard, payoutConfirmKeyboard, escapeHtml, backHomeKeyboard } from '../keyboards.js'
import { notifyMember } from '../notify.js'

export async function handlePayoutsList(ctx) {
  await ctx.answerCallbackQuery()
  const payouts = await prisma.payoutRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: { requestedAt: 'asc' },
    include: { account: { include: { user: { select: { name: true, matricola: true } } } } },
    take: 8,
  })
  const total = await prisma.payoutRequest.count({ where: { status: 'PENDING' } })
  const text = total === 0
    ? '💰 <b>Rimborsi</b>\n\nNessun rimborso in attesa.'
    : `💰 <b>Rimborsi in attesa</b> (${total})\n\nSeleziona:`
  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: payoutsListKeyboard(payouts),
  })
}

export async function handlePayoutView(ctx, payoutId) {
  await ctx.answerCallbackQuery()
  const payout = await prisma.payoutRequest.findUnique({
    where: { id: payoutId },
    include: {
      account: {
        include: {
          user: { select: { name: true, email: true, matricola: true } },
          program: true,
        },
      },
    },
  })
  if (!payout) return ctx.editMessageText('Rimborso non trovato.', { reply_markup: backHomeKeyboard() })
  const statusLabel = { PENDING: '⏳ In attesa', APPROVED: '✅ Approvato', REJECTED: '❌ Rifiutato' }
  const text =
    `💰 <b>Rimborso</b>\n\n` +
    `👤 <b>${escapeHtml(payout.account?.user?.name)}</b> · <code>${escapeHtml(payout.account?.user?.matricola || 'N/D')}</code>\n` +
    `💵 Importo: <b>$${Number(payout.amount).toLocaleString()}</b>\n` +
    `📋 Programma: <b>${escapeHtml(payout.account?.program?.name || 'N/D')}</b>\n` +
    `📅 Richiesto: <b>${new Date(payout.requestedAt).toLocaleDateString('it-IT')}</b>\n` +
    (payout.walletAddress ? `🔑 Wallet: <code>${escapeHtml(payout.walletAddress)}</code>\n` : '') +
    `\nStato: ${statusLabel[payout.status] || payout.status}`
  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: payoutDetailKeyboard(payoutId),
  })
}

export async function handlePayoutAction(ctx, action, payoutId) {
  await ctx.answerCallbackQuery()
  const label = action === 'apr' ? 'approvare' : 'rifiutare'
  await ctx.editMessageText(
    `⚠️ <b>Conferma</b>\n\nVuoi <b>${label}</b> questo rimborso?`,
    { parse_mode: 'HTML', reply_markup: payoutConfirmKeyboard(action, payoutId) }
  )
}

export async function handlePayoutConfirm(ctx, action, payoutId) {
  await ctx.answerCallbackQuery()
  const payout = await prisma.payoutRequest.findUnique({
    where: { id: payoutId },
    include: { account: { include: { user: true } } },
  })
  if (!payout || payout.status !== 'PENDING') {
    return ctx.editMessageText('⚠️ Rimborso già processato o non trovato.', { reply_markup: backHomeKeyboard() })
  }
  try {
    const newStatus = action === 'apr' ? 'APPROVED' : 'REJECTED'
    const updated = await prisma.payoutRequest.update({
      where: { id: payoutId },
      data: { status: newStatus, processedAt: new Date() },
      include: { account: { include: { user: true } } },
    })
    if (action === 'apr' && updated.account?.user?.telegramChatId) {
      const { bot } = await import('../index.js')
      await notifyMember(bot, updated.account.user, 'payout_unlocked', { amount: updated.amount }).catch(() => {})
    }
    const verb = action === 'apr' ? 'approvato' : 'rifiutato'
    await ctx.editMessageText(
      `✅ <b>Rimborso ${verb}</b>\n\nRimborso di <b>${escapeHtml(payout.account?.user?.name)}</b> ${verb}.`,
      { parse_mode: 'HTML', reply_markup: backHomeKeyboard() }
    )
  } catch (e) {
    console.error('[bot/payouts] confirm error:', e.message)
    await ctx.editMessageText('Errore durante l\'operazione.', { reply_markup: backHomeKeyboard() })
  }
}
