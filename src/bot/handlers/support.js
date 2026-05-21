import { Composer, InlineKeyboard } from 'grammy'
import { notifyMember, escapeHtml } from '../notify.js'
import { prisma } from '../../lib/prisma.js'

const PAGE_SIZE = 8

export function buildSupportHandlers(bot, auth) {
  const composer = new Composer()

  // Entry point
  composer.callbackQuery('v1:sec:support', async (ctx) => {
    if (!(await auth.isMod(ctx))) { await ctx.answerCallbackQuery({ text: '⛔ Accesso negato', show_alert: true }); return }
    await ctx.answerCallbackQuery().catch(() => {})
    await renderInbox(ctx, 0)
  })

  composer.callbackQuery(/^sup:list:(\d+)$/, async (ctx) => {
    if (!(await auth.isMod(ctx))) { await ctx.answerCallbackQuery({ text: '⛔ Accesso negato', show_alert: true }); return }
    await ctx.answerCallbackQuery().catch(() => {})
    await renderInbox(ctx, parseInt(ctx.match[1], 10))
  })

  composer.callbackQuery(/^sup:open:(.+)$/, async (ctx) => {
    if (!(await auth.isMod(ctx))) { await ctx.answerCallbackQuery({ text: '⛔ Accesso negato', show_alert: true }); return }
    await ctx.answerCallbackQuery().catch(() => {})
    await renderConversation(ctx, ctx.match[1])
  })

  composer.callbackQuery(/^sup:reply:(.+)$/, async (ctx) => {
    if (!(await auth.isMod(ctx))) { await ctx.answerCallbackQuery({ text: '⛔ Accesso negato', show_alert: true }); return }
    await ctx.answerCallbackQuery({ text: 'Scrivi la tua risposta…' }).catch(() => {})
    await ctx.conversation.enter('supportReply', { convId: ctx.match[1] })
  })

  composer.callbackQuery(/^sup:close:(.+)$/, async (ctx) => {
    if (!(await auth.isMod(ctx))) { await ctx.answerCallbackQuery({ text: '⛔ Accesso negato', show_alert: true }); return }
    const convId = ctx.match[1]
    try {
      const conv = await prisma.supportConversation.update({
        where: { id: convId },
        data: { status: 'RESOLVED', closedAt: new Date(), closedByChatId: String(ctx.from.id), unreadByAdmin: 0 },
        include: { user: true },
      })
      await ctx.answerCallbackQuery({ text: 'Conversazione chiusa.' })
      await ctx.editMessageText(
        `✅ <b>Conversazione chiusa</b>\nMembro: ${escapeHtml(conv.user.name)}\nChiusa: ${new Date().toLocaleString('it-IT')}`,
        { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Inbox', 'sup:list:0') }
      )
      await notifyMember(bot, conv.user, 'support_closed', { conversationId: conv.id })
    } catch (e) {
      console.error(`[sup:close] ${e.message}`)
      await ctx.answerCallbackQuery({ text: 'Errore chiusura.', show_alert: true })
    }
  })

  // Rating
  composer.callbackQuery(/^rate:([^:]+):([1-5])$/, async (ctx) => {
    const convId = ctx.match[1]
    const score = parseInt(ctx.match[2], 10)
    try {
      const conv = await prisma.supportConversation.findUnique({ where: { id: convId }, include: { user: true } })
      if (!conv) { await ctx.answerCallbackQuery({ text: 'Conversazione non trovata.', show_alert: true }); return }
      if (String(ctx.from.id) !== conv.user.telegramChatId) {
        await ctx.answerCallbackQuery({ text: 'Non autorizzato.', show_alert: true }); return
      }
      await prisma.supportRating.upsert({
        where: { conversationId: convId },
        create: { conversationId: convId, userId: conv.userId, score },
        update: { score },
      })
      await ctx.answerCallbackQuery({ text: 'Grazie per il feedback!' })
      await ctx.editMessageText(`✅ Grazie. Hai valutato: ${'⭐'.repeat(score)}\nFeedback registrato.`)
    } catch (e) {
      console.error(`[rate] ${e.message}`)
    }
  })

  return composer
}

export async function supportReplyConvo(conversation, ctx) {
  const { convId } = conversation.arg ?? {}
  if (!convId) { await ctx.reply('Errore: conversazione non specificata.'); return }

  const conv = await conversation.external(() =>
    prisma.supportConversation.findUnique({ where: { id: convId }, include: { user: true } })
  )
  if (!conv) { await ctx.reply('Conversazione non trovata.'); return }

  await ctx.reply(
    `✍️ Risposta a <b>${escapeHtml(conv.user.name)}</b>:\n(<code>/annulla</code> per uscire)`,
    { parse_mode: 'HTML' }
  )
  const { message } = await conversation.waitFor('message:text')
  if (message.text === '/annulla') { await ctx.reply('Annullato.'); return }

  await conversation.external(async () => {
    const { bot } = await import('../index.js')
    await prisma.supportMessage.create({
      data: { conversationId: convId, senderRole: 'ADMIN', senderChatId: String(ctx.from.id), body: message.text },
    })
    await prisma.supportConversation.update({
      where: { id: convId },
      data: { status: 'IN_PROGRESS', lastMessageAt: new Date(), unreadByMember: { increment: 1 } },
    })
    await notifyMember(bot, conv.user, 'support_admin_reply', { body: message.text })
  })
  await ctx.reply('✅ Risposta inviata al membro.', { reply_markup: new InlineKeyboard().text('← Inbox', 'sup:list:0') })
}

// ── helpers ──

async function renderInbox(ctx, page) {
  const skip = page * PAGE_SIZE
  const [convs, total, unreadAgg] = await Promise.all([
    prisma.supportConversation.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: { lastMessageAt: 'desc' },
      skip, take: PAGE_SIZE,
      include: { user: { select: { name: true, matricola: true } } },
    }),
    prisma.supportConversation.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.supportConversation.aggregate({ _sum: { unreadByAdmin: true }, where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
  ])
  if (convs.length === 0) {
    return ctx.editMessageText('💬 <b>Supporto</b>\n\nNessuna conversazione aperta.', {
      parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Home', 'v1:home'),
    })
  }
  const kb = new InlineKeyboard()
  for (const c of convs) {
    const label = ((c.unreadByAdmin > 0 ? '🔴 ' : '▫️ ') + `${c.user?.name || 'N/D'}` + (c.unreadByAdmin > 0 ? ` (${c.unreadByAdmin})` : '')).substring(0, 40)
    kb.text(label, `sup:open:${c.id}`).row()
  }
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages > 1) {
    if (page > 0) kb.text('‹ prec', `sup:list:${page - 1}`)
    kb.text(`${page + 1}/${pages}`, 'v1:nop')
    if (page < pages - 1) kb.text('succ ›', `sup:list:${page + 1}`)
    kb.row()
  }
  kb.text('← Home', 'v1:home')
  await ctx.editMessageText(
    `💬 <b>Supporto</b> (${unreadAgg._sum.unreadByAdmin || 0} non letti)\nConversazioni aperte: ${total}`,
    { parse_mode: 'HTML', reply_markup: kb }
  )
}

async function renderConversation(ctx, convId) {
  const conv = await prisma.supportConversation.findUnique({
    where: { id: convId },
    include: { user: { select: { name: true, matricola: true, telegramChatId: true } }, messages: { orderBy: { createdAt: 'asc' }, take: 30 } },
  })
  if (!conv) { await ctx.answerCallbackQuery({ text: 'Non trovata.', show_alert: true }); return }
  if (conv.unreadByAdmin > 0) await prisma.supportConversation.update({ where: { id: convId }, data: { unreadByAdmin: 0 } })
  const lines = [
    `💬 <b>${escapeHtml(conv.user?.name)}</b> · <code>${escapeHtml(conv.user?.matricola || '—')}</code>`,
    `Stato: <b>${conv.status}</b> · ${conv.openedAt.toLocaleDateString('it-IT')}`, '',
    ...conv.messages.map(m => {
      const who = m.senderRole === 'MEMBER' ? '👤' : m.senderRole === 'ADMIN' ? '🛡' : '🤖'
      const ts = m.createdAt.toTimeString().slice(0, 5)
      const sum = m.aiSummary ? ` <i>[AI: ${escapeHtml(m.aiSummary.slice(0, 80))}]</i>` : ''
      return `${who} <i>${ts}</i> ${escapeHtml(m.body).slice(0, 400)}${sum}`
    }),
  ]
  const kb = new InlineKeyboard()
    .text('✍️ Rispondi', `sup:reply:${conv.id}`)
    .text('✅ Chiudi', `sup:close:${conv.id}`).row()
    .text('← Inbox', 'sup:list:0')
  await ctx.editMessageText(lines.join('\n').slice(0, 4000), { parse_mode: 'HTML', reply_markup: kb })
}
