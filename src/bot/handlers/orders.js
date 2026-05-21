import { prisma } from '../../lib/prisma.js'
import { isMod } from '../auth.js'
import { notifyMember, escapeHtml } from '../notify.js'
import {
  ordersListKeyboard, orderDetailKeyboard,
  orderConfirmKeyboard, backHomeKeyboard
} from '../keyboards.js'
import { InlineKeyboard } from 'grammy'

export async function handleOrdersList(ctx) {
  await ctx.answerCallbackQuery()
  const orders = await prisma.order.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true, matricola: true } } },
    take: 8,
  })
  const total = await prisma.order.count({ where: { status: 'PENDING' } })
  const text = total === 0
    ? '🎖 <b>Promozioni</b>\n\nNessuna richiesta in attesa.'
    : `🎖 <b>Promozioni in attesa</b> (${total})\n\nSeleziona una richiesta:`
  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: ordersListKeyboard(orders),
  })
}

export async function handleOrderView(ctx, orderId) {
  await ctx.answerCallbackQuery()
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { name: true, email: true, matricola: true, rank: true } } },
  })
  if (!order) {
    return ctx.editMessageText('Ordine non trovato.', { reply_markup: backHomeKeyboard() })
  }
  const mod = await isMod(ctx)
  const statusLabel = { PENDING: '⏳ In attesa', APPROVED: '✅ Approvato', REJECTED: '❌ Rifiutato' }
  const text =
    `🎖 <b>Promozione #${escapeHtml(order.id.slice(-6).toUpperCase())}</b>\n\n` +
    `👤 <b>${escapeHtml(order.user?.name)}</b> · <code>${escapeHtml(order.user?.matricola || 'N/D')}</code>\n` +
    `📧 ${escapeHtml(order.user?.email)}\n` +
    `🎗 Grado attuale: <b>${escapeHtml(order.user?.rank || 'Recluta')}</b>\n` +
    `⬆️ Richiesta: <b>${escapeHtml(order.programName)}</b>\n` +
    `💵 Importo: <b>${order.amount} ${order.currency}</b>${order.network ? ` (${order.network})` : ''}\n` +
    (order.txHash ? `🔗 TxHash: <code>${escapeHtml(order.txHash)}</code>\n` : '') +
    (order.receiptUrl ? `📎 <a href="${escapeHtml(order.receiptUrl)}">Apri ricevuta</a>\n` : '') +
    `\nStato: ${statusLabel[order.status] || order.status}`
  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: orderDetailKeyboard(orderId, mod && order.status === 'PENDING'),
    link_preview_options: { is_disabled: true },
  })
}

export async function handleOrderAction(ctx, action, orderId) {
  await ctx.answerCallbackQuery()
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  })
  if (!order || order.status !== 'PENDING') {
    return ctx.editMessageText('⚠️ Ordine non più disponibile o già processato.', {
      reply_markup: backHomeKeyboard(),
    })
  }
  const actionLabel = action === 'apr' ? 'approvare' : 'rifiutare'
  await ctx.editMessageText(
    `⚠️ <b>Conferma operazione</b>\n\nVuoi <b>${actionLabel}</b> la promozione di <b>${escapeHtml(order.user?.name || '')}</b> a <b>${escapeHtml(order.programName)}</b>?`,
    { parse_mode: 'HTML', reply_markup: orderConfirmKeyboard(action, orderId) }
  )
}

export async function handleOrderConfirm(ctx, action, orderId) {
  await ctx.answerCallbackQuery()
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  })
  if (!order || order.status !== 'PENDING') {
    return ctx.editMessageText('⚠️ Ordine già processato o non trovato.', {
      reply_markup: backHomeKeyboard(),
    })
  }
  try {
    if (action === 'apr') {
      const program = await prisma.program.findUnique({ where: { id: order.programId } })
      await prisma.user.update({
        where: { id: order.userId },
        data: { rank: program?.name || order.programName, purchaseCount: { increment: 1 } },
      })
      if (program) {
        const existing = await prisma.propAccount.findFirst({
          where: { userId: order.userId, programId: program.id, status: 'ACTIVE' },
        })
        if (!existing) {
          await prisma.propAccount.create({
            data: {
              userId: order.userId, programId: program.id,
              brokerLogin: 'DA ASSEGNARE', broker: 'cTrader',
              startBalance: program.accountSize, status: 'ACTIVE',
            },
          })
        }
      }
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'APPROVED', decidedAt: new Date(), decidedBy: 'telegram-bot', approvalToken: null },
      })
      await prisma.serviceLogEntry.create({
        data: {
          userId: order.userId, type: 'promotion',
          title: `Promosso a ${order.programName}`,
          body: 'Versamento verificato. Approvato dal Comando via Telegram.',
          iconKey: 'star',
        },
      }).catch(() => {})
      await ctx.editMessageText(
        `✅ <b>Promozione approvata</b>\n\n<b>${escapeHtml(order.user?.name)}</b> promosso a <b>${escapeHtml(order.programName)}</b>.\nMissione attivata.`,
        { parse_mode: 'HTML', reply_markup: backHomeKeyboard() }
      )
    } else {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'REJECTED', decidedAt: new Date(), decidedBy: 'telegram-bot' },
      })
      await prisma.serviceLogEntry.create({
        data: {
          userId: order.userId, type: 'note',
          title: `Richiesta ${order.programName} rifiutata`,
          body: 'Versamento non verificato. Rifiutato via Telegram.',
          iconKey: 'shield',
        },
      }).catch(() => {})
      await ctx.editMessageText(
        `❌ <b>Promozione rifiutata</b>\n\nRichiesta di <b>${escapeHtml(order.user?.name)}</b> rifiutata.`,
        { parse_mode: 'HTML', reply_markup: backHomeKeyboard() }
      )
    }
  } catch (e) {
    console.error('[bot/orders] confirm error:', e.message)
    await ctx.editMessageText('Errore durante l\'operazione. Riprova.', { reply_markup: backHomeKeyboard() })
  }
}

// Conversation: rifiuto con motivo
export async function rejectOrderReasonConvo(conversation, ctx) {
  const { orderId } = conversation.arg ?? {}
  if (!orderId) { await ctx.reply('Errore: ordine non specificato.'); return }

  await ctx.reply(
    `✍️ Scrivi il <b>motivo del rifiuto</b> per l\'ordine <code>${escapeHtml(orderId)}</code>:\n(5-500 caratteri, <code>/annulla</code> per uscire)`,
    { parse_mode: 'HTML' }
  )

  let reason
  while (true) {
    const { message } = await conversation.waitFor('message:text')
    if (message.text === '/annulla') { await ctx.reply('Annullato — ordine NON rifiutato.'); return }
    if (message.text.length < 5 || message.text.length > 500) {
      await ctx.reply('Motivo non valido (5-500 caratteri). Riprova:'); continue
    }
    reason = message.text; break
  }

  const order = await conversation.external(async () => {
    const { bot } = await import('../index.js')
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'REJECTED', rejectionReason: reason, decidedAt: new Date(), decidedBy: 'telegram-bot' },
      include: { user: true },
    })
    await prisma.serviceLogEntry.create({
      data: {
        userId: updated.userId, type: 'note',
        title: `Richiesta ${updated.programName} rifiutata`,
        body: `Motivo: ${reason}`, iconKey: 'shield',
      },
    }).catch(() => {})
    await notifyMember(bot, updated.user, 'order_rejected', { orderId: updated.id, reason })
    return updated
  })

  await ctx.reply(
    `✅ Ordine <code>${escapeHtml(order.id)}</code> rifiutato.\nMembro notificato con il motivo.`,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Promozioni', 'v1:sec:orders') }
  )
}
