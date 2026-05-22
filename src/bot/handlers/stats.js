import { prisma } from '../../lib/prisma.js'
import { broadcastConfirmKeyboard, backHomeKeyboard, escapeHtml } from '../keyboards.js'
import { InlineKeyboard } from 'grammy'

// Stato in memoria per la sessione broadcast (semplicistica ma sufficiente per ~30 utenti)
const broadcastDraft = new Map()

export async function handleStats(ctx) {
  await ctx.answerCallbackQuery()
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    revenue30d, totalUsers, linkedUsers, openTickets,
    avgRating, missionsThisMonth, pendingOrders, activeMissions, pendingPayouts,
  ] = await Promise.all([
    prisma.order.aggregate({ _sum: { amount: true }, where: { status: 'APPROVED', updatedAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { role: 'TRADER', approved: true } }),
    prisma.user.count({ where: { telegramChatId: { not: null }, role: 'TRADER' } }),
    prisma.supportConversation.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }).catch(() => 0),
    prisma.supportRating.aggregate({ _avg: { score: true }, _count: true }).catch(() => ({ _avg: { score: null }, _count: 0 })),
    prisma.propAccount.count({ where: { status: 'PASSED', updatedAt: { gte: firstOfMonth } } }).catch(() => 0),
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.propAccount.count({ where: { status: 'ACTIVE' } }),
    prisma.payoutRequest.count({ where: { status: 'PENDING' } }),
  ])

  const rev = Number(revenue30d._sum.amount || 0)
  const linkedPct = totalUsers > 0 ? Math.round((linkedUsers * 1000) / totalUsers) / 10 : 0
  const stars = avgRating._avg.score ? '⭐'.repeat(Math.round(avgRating._avg.score)) : '—'

  await ctx.editMessageText(
    `📊 <b>Rapporto rapido</b>\n\n` +
    `💰 Incassi ultimi 30gg: <b>$${rev.toLocaleString()}</b>\n` +
    `👥 Membri totali: <b>${totalUsers}</b>\n` +
    `📱 Collegati Telegram: <b>${linkedUsers}</b> (${linkedPct}%)\n` +
    `⚔️ Missioni attive: <b>${activeMissions}</b>\n` +
    `🎯 Missioni completate (mese): <b>${missionsThisMonth}</b>\n` +
    `🎖 Promozioni in attesa: <b>${pendingOrders}</b>\n` +
    `💸 Rimborsi in attesa: <b>${pendingPayouts}</b>\n` +
    `💬 Ticket aperti: <b>${openTickets}</b>\n` +
    `⭐ Val. supporto: <b>${avgRating._avg.score ? Number(avgRating._avg.score).toFixed(2) : '—'}</b> ${stars} (n=${avgRating._count})`,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('🔄 Aggiorna', 'v1:sec:stats').text('← Home', 'v1:home') }
  )
}

export async function handleBroadcastStart(ctx) {
  await ctx.answerCallbackQuery()
  broadcastDraft.set(ctx.from.id, { waiting: true })
  await ctx.editMessageText(
    `📢 <b>Ordine del Giorno</b>\n\nScrivi il messaggio da inviare a tutti i membri collegati.\n\n<i>Invia il testo nella chat ora.</i>`,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('❌ Annulla', 'v1:home') }
  )
}

export async function handleBroadcastText(ctx) {
  const draft = broadcastDraft.get(ctx.from.id)
  if (!draft?.waiting) return
  const text = ctx.message?.text
  if (!text) return
  const count = await prisma.user.count({
    where: { telegramChatId: { not: null }, role: 'TRADER' },
  })
  broadcastDraft.set(ctx.from.id, { text, waiting: false })
  await ctx.reply(
    `📢 <b>Anteprima messaggio</b>\n\n${escapeHtml(text)}\n\n<i>Verrà inviato a ${count} membri.</i>`,
    { parse_mode: 'HTML', reply_markup: broadcastConfirmKeyboard(count) }
  )
}

export async function handleBroadcastConfirm(ctx) {
  await ctx.answerCallbackQuery()
  const draft = broadcastDraft.get(ctx.from.id)
  if (!draft?.text) {
    return ctx.editMessageText('Nessun messaggio in bozza. Riprova.', { reply_markup: backHomeKeyboard() })
  }
  const members = await prisma.user.findMany({
    where: { telegramChatId: { not: null }, role: 'TRADER' },
    select: { telegramChatId: true, name: true },
  })
  broadcastDraft.delete(ctx.from.id)
  await ctx.editMessageText(
    `📢 <b>Broadcast in corso...</b>\n\n0 / ${members.length} inviati`,
    { parse_mode: 'HTML' }
  )
  let sent = 0, failed = 0
  for (const member of members) {
    try {
      await ctx.api.sendMessage(
        Number(member.telegramChatId),
        `📢 <b>ORDINE DEL GIORNO</b>\n\n${escapeHtml(draft.text)}`,
        { parse_mode: 'HTML' }
      )
      sent++
    } catch (e) {
      failed++
      if (e.error_code === 403) {
        await prisma.user.updateMany({
          where: { telegramChatId: member.telegramChatId },
          data: { telegramChatId: null },
        }).catch(() => {})
      }
    }
    await new Promise(r => setTimeout(r, 50)) // ~20 msg/s sotto il limite di 30
  }
  await ctx.reply(
    `✅ <b>Broadcast completato</b>\n\n✅ Inviati: <b>${sent}</b>\n❌ Falliti: <b>${failed}</b>`,
    { parse_mode: 'HTML', reply_markup: backHomeKeyboard() }
  )
}
