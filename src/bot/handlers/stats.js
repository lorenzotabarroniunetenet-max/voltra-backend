import { prisma } from '../../lib/prisma.js'
import { broadcastConfirmKeyboard, backHomeKeyboard, escapeHtml } from '../keyboards.js'
import { InlineKeyboard } from 'grammy'
import { generateOdG } from '../../services/claude.js'

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
  broadcastDraft.set(ctx.from.id, { waiting: true, mode: null })
  await ctx.editMessageText(
    `📢 <b>Ordine del Giorno</b>\n\nCome vuoi procedere?`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('🤖 Genera con AI', 'v1:bc:ai').row()
        .text('✏️ Scrivi manualmente', 'v1:bc:manual').row()
        .text('❌ Annulla', 'v1:home')
    }
  )
}

export async function handleBroadcastAI(ctx) {
  await ctx.answerCallbackQuery()
  broadcastDraft.set(ctx.from.id, { waiting: true, mode: 'ai' })
  await ctx.editMessageText(
    `🤖 <b>OdG con AI</b>\n\nScrivi 2-3 parole chiave e Claude genera il comunicato ufficiale.\n\n<i>Esempi: "ottimi risultati", "nuovi gradi in arrivo", "settimana difficile ma avanti"</i>`,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('❌ Annulla', 'v1:home') }
  )
}

export async function handleBroadcastManual(ctx) {
  await ctx.answerCallbackQuery()
  broadcastDraft.set(ctx.from.id, { waiting: true, mode: 'manual' })
  await ctx.editMessageText(
    `✏️ <b>OdG manuale</b>\n\nScrivi il messaggio completo da inviare a tutti i membri.\n\n<i>Invia il testo nella chat ora.</i>`,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('❌ Annulla', 'v1:home') }
  )
}

export async function handleBroadcastText(ctx) {
  const draft = broadcastDraft.get(ctx.from.id)
  if (!draft?.waiting) return false
  const input = ctx.message?.text
  if (!input) return false

  const count = await prisma.user.count({ where: { telegramChatId: { not: null }, role: 'TRADER' } })

  if (draft.mode === 'ai') {
    broadcastDraft.set(ctx.from.id, { waiting: false, mode: 'ai', generating: true })
    await ctx.reply('🤖 Generazione in corso...', { parse_mode: 'HTML' })
    const generated = await generateOdG(input)
    if (!generated) {
      await ctx.reply('⚠️ Generazione fallita. Riprova o usa la modalità manuale.', { reply_markup: backHomeKeyboard() })
      broadcastDraft.delete(ctx.from.id)
      return true
    }
    broadcastDraft.set(ctx.from.id, { text: generated, waiting: false, mode: 'ai' })
    await ctx.reply(
      `📋 <b>OdG generato dall'AI</b>\n\n${escapeHtml(generated)}\n\n<i>Verrà inviato a ${count} membri.</i>`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard()
          .text('📢 Invia a tutti', 'v1:bc:conf').row()
          .text('🔄 Rigenera', `v1:bc:regen`).row()
          .text('❌ Annulla', 'v1:home')
      }
    )
    broadcastDraft.set(ctx.from.id, { text: generated, waiting: false, mode: 'ai', keywords: input })
    return true
  }

  // Modalità manuale
  broadcastDraft.set(ctx.from.id, { text: input, waiting: false, mode: 'manual' })
  await ctx.reply(
    `📢 <b>Anteprima</b>\n\n${escapeHtml(input)}\n\n<i>Verrà inviato a ${count} membri.</i>`,
    { parse_mode: 'HTML', reply_markup: broadcastConfirmKeyboard(count) }
  )
  return true
}

export async function handleBroadcastRegen(ctx) {
  await ctx.answerCallbackQuery({ text: 'Rigenerazione...' })
  const draft = broadcastDraft.get(ctx.from.id)
  if (!draft?.keywords) { await ctx.editMessageText('Sessione scaduta. Riprova.', { reply_markup: backHomeKeyboard() }); return }
  const generated = await generateOdG(draft.keywords)
  if (!generated) { await ctx.answerCallbackQuery({ text: 'Generazione fallita.', show_alert: true }); return }
  const count = await prisma.user.count({ where: { telegramChatId: { not: null }, role: 'TRADER' } })
  broadcastDraft.set(ctx.from.id, { ...draft, text: generated })
  await ctx.editMessageText(
    `📋 <b>OdG rigenerato</b>\n\n${escapeHtml(generated)}\n\n<i>Verrà inviato a ${count} membri.</i>`,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard()
        .text('📢 Invia a tutti', 'v1:bc:conf').row()
        .text('🔄 Rigenera', 'v1:bc:regen').row()
        .text('❌ Annulla', 'v1:home')
    }
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

  // Salva nella Sala Briefing
  await prisma.briefing.create({
    data: {
      title: 'Ordine del Giorno',
      content: draft.text,
      pinned: false,
    }
  }).catch(() => {}) // graceful se campo aiGenerated non esiste ancora

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
    await new Promise(r => setTimeout(r, 50))
  }
  await ctx.reply(
    `✅ <b>Broadcast completato</b>\n\n✅ Inviati: <b>${sent}</b>\n❌ Falliti: <b>${failed}</b>`,
    { parse_mode: 'HTML', reply_markup: backHomeKeyboard() }
  )
}
