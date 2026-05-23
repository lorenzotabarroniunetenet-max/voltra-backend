import { Bot, session, InlineKeyboard } from 'grammy'
import { conversations, createConversation } from '@grammyjs/conversations'
import { autoRetry } from '@grammyjs/auto-retry'
import { prisma } from '../lib/prisma.js'
import { getSetting, setSetting } from '../lib/settings.js'

import { isAdmin, isMod, isSuperAdmin } from './auth.js'
import { adminHomeKeyboard, memberHomeKeyboard, escapeHtml } from './keyboards.js'

import { handleStart } from './handlers/start.js'
import { handleOrdersList, handleOrderView, handleOrderAction, handleOrderConfirm, rejectOrderReasonConvo } from './handlers/orders.js'
import { handleMissionsList, handleMissionView, handleMissionAction, handleMissionConfirm } from './handlers/missions.js'
import { handlePayoutsList, handlePayoutView, handlePayoutAction, handlePayoutConfirm } from './handlers/payouts.js'
import { handleMemberRank, handleMemberMission, handleMemberPayout, handleMemberFAQ, handleMemberLinkRequest } from './handlers/member.js'
import { handleStats, handleBroadcastStart, handleBroadcastText, handleBroadcastConfirm, handleBroadcastAI, handleBroadcastManual, handleBroadcastRegen } from './handlers/stats.js'
import { buildSupportHandlers, supportReplyConvo } from './handlers/support.js'
import { buildSettingsHandlers, addModeratorConvo, sendDirectMessageConvo, setWelcomeMessageConvo } from './handlers/settings.js'
import { buildSubscriptionHandlers } from './handlers/subscriptions.js'
import { notifyMember } from './notify.js'

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.warn('[bot] TELEGRAM_BOT_TOKEN mancante — bot disabilitato')
}

// Esporto il bot per uso in altri moduli (conversations, notify)
export const bot = process.env.TELEGRAM_BOT_TOKEN
  ? new Bot(process.env.TELEGRAM_BOT_TOKEN)
  : null

const auth = {
  isAdmin: ctx => isAdmin(ctx),
  isMod: ctx => isMod(ctx),
  isSuperAdmin: ctx => isSuperAdmin(ctx),
}

if (bot) {
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }))

  // 1) Session
  bot.use(session({ initial: () => ({}) }))

  // 2) Conversations plugin con storage in-memory
  bot.use(conversations())

  // 3) Registrazione conversations
  bot.use(createConversation(rejectOrderReasonConvo, 'rejectOrderReason'))
  bot.use(createConversation(supportReplyConvo, 'supportReply'))
  bot.use(createConversation(addModeratorConvo, 'addModerator'))
  bot.use(createConversation(sendDirectMessageConvo, 'sendDirectMessage'))
  bot.use(createConversation(setWelcomeMessageConvo, 'setWelcomeMessage'))

  // 4) Handlers composti
  bot.use(buildSupportHandlers(bot, auth))
  bot.use(buildSettingsHandlers(bot, auth))
  bot.use(buildSubscriptionHandlers(auth))

  // ── COMMANDS ──
  bot.command('start', handleStart)

  bot.command('menu', async (ctx) => {
    const admin = await isAdmin(ctx)
    if (admin) return sendAdminHome(ctx)
    const user = await prisma.user.findFirst({ where: { telegramChatId: String(ctx.from.id) } })
    return ctx.reply(
      user ? `⚡ <b>VOLTRA COMANDO</b>\n\nCome posso aiutarti, <b>${escapeHtml(user.name)}</b>?`
           : '⚡ <b>VOLTRA COMANDO</b>\n\nCollega il tuo account dal sito.',
      { parse_mode: 'HTML', reply_markup: memberHomeKeyboard(!!user) }
    )
  })

  bot.command('whoami', async (ctx) => {
    const admin = await isAdmin(ctx)
    const mod = await isMod(ctx)
    await ctx.reply(
      `🪪 <b>La tua identità Telegram</b>\n\nChat ID: <code>${ctx.from.id}</code>\nUsername: @${escapeHtml(ctx.from.username || 'nessuno')}\nNome: ${escapeHtml(ctx.from.first_name || '')}` +
      (admin ? '\n\n⚡ <b>Sei Superadmin Voltra</b>' : mod ? '\n\n🛡 <b>Sei Moderatore Voltra</b>' : ''),
      { parse_mode: 'HTML' }
    )
  })

  // ── CALLBACKS ──
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data

    if (data === 'v1:home') {
      await ctx.answerCallbackQuery()
      if (await isAdmin(ctx)) return editAdminHome(ctx)
      const user = await prisma.user.findFirst({ where: { telegramChatId: String(ctx.from.id) } })
      return ctx.editMessageText(
        user ? `⚡ <b>VOLTRA COMANDO</b>\n\nCome posso aiutarti, <b>${escapeHtml(user.name)}</b>?` : '⚡ <b>VOLTRA COMANDO</b>',
        { parse_mode: 'HTML', reply_markup: memberHomeKeyboard(!!user) }
      )
    }

    if (data === 'v1:member:home') {
      await ctx.answerCallbackQuery()
      const user = await prisma.user.findFirst({ where: { telegramChatId: String(ctx.from.id) } })
      return ctx.editMessageText(
        user ? `⚡ <b>VOLTRA COMANDO</b>\n\nCome posso aiutarti, <b>${escapeHtml(user.name)}</b>?` : '⚡ <b>VOLTRA COMANDO</b>',
        { parse_mode: 'HTML', reply_markup: memberHomeKeyboard(!!user) }
      )
    }

    if (data === 'v1:nop') { await ctx.answerCallbackQuery(); return }

    // Admin sections
    if (data === 'v1:sec:orders') { if (!(await isMod(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleOrdersList(ctx); return }
    if (data === 'v1:sec:payouts') { if (!(await isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handlePayoutsList(ctx); return }
    if (data === 'v1:sec:missions') { if (!(await isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleMissionsList(ctx); return }
    if (data === 'v1:sec:stats') { if (!(await isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleStats(ctx); return }
    if (data === 'v1:sec:broadcast') { if (!(await isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleBroadcastStart(ctx); return }
    if (data === 'v1:bc:ai') { if (!(await isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleBroadcastAI(ctx); return }
    if (data === 'v1:bc:manual') { if (!(await isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleBroadcastManual(ctx); return }
    if (data === 'v1:bc:regen') { if (!(await isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleBroadcastRegen(ctx); return }
    if (data === 'v1:bc:conf') { if (!(await isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleBroadcastConfirm(ctx); return }
    if (data === 'v1:sec:members') { if (!(await isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleMembersList(ctx); return }

    // Ordini
    let m
    if ((m = data.match(/^v1:o:view:(.+)$/))) { if (!(await isMod(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleOrderView(ctx, m[1]); return }
    if ((m = data.match(/^v1:o:(apr):(.+)$/))) { if (!(await isMod(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleOrderAction(ctx, m[1], m[2]); return }
    if ((m = data.match(/^v1:o:(rej):(.+)$/))) {
      if (!(await isMod(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
      await ctx.answerCallbackQuery()
      const orderId = m[2]
      const order = await prisma.order.findUnique({ where: { id: orderId } })
      if (!order || order.status !== 'PENDING') { await ctx.editMessageText('⚠️ Ordine già processato.', { reply_markup: new InlineKeyboard().text('← Home', 'v1:home') }); return }
      await ctx.editMessageText(
        `⚠️ <b>Conferma rifiuto</b>\n\nVuoi rifiutare la promozione di <b>${escapeHtml(order.programName)}</b>?\nDovrai fornire un motivo.`,
        { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('❌ Sì, rifiuta con motivo', `v1:o:rej:start:${orderId}`).text('← Annulla', `v1:o:view:${orderId}`) }
      )
      return
    }
    if ((m = data.match(/^v1:o:rej:start:(.+)$/))) {
      if (!(await isMod(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
      await ctx.answerCallbackQuery()
      await ctx.conversation.enter('rejectOrderReason', m[1])
      return
    }
    if ((m = data.match(/^v1:o:conf:(apr|rej):(.+)$/))) { if (!(await isMod(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleOrderConfirm(ctx, m[1], m[2]); return }

    // Missioni
    if ((m = data.match(/^v1:m:view:(.+)$/))) { if (!(await isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleMissionView(ctx, m[1]); return }
    if ((m = data.match(/^v1:m:(set|payout):([^:]+):(.+)$/))) {
      if (!(await isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
      const action = m[1] === 'payout' ? 'payout' : m[2]; const id = m[3]
      await handleMissionAction(ctx, action, id); return
    }
    if ((m = data.match(/^v1:m:conf:([^:]+):(.+)$/))) { if (!(await isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleMissionConfirm(ctx, m[1], m[2]); return }

    // Rimborsi
    if ((m = data.match(/^v1:p:view:(.+)$/))) { if (!(await isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handlePayoutView(ctx, m[1]); return }
    if ((m = data.match(/^v1:p:(apr|rej):(.+)$/))) { if (!(await isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handlePayoutAction(ctx, m[1], m[2]); return }
    if ((m = data.match(/^v1:p:conf:(apr|rej):(.+)$/))) { if (!(await isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handlePayoutConfirm(ctx, m[1], m[2]); return }

    // Membri
    if ((m = data.match(/^v1:mem:view:(.+)$/))) { if (!(await isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return } await handleMemberView(ctx, m[1]); return }
    if ((m = data.match(/^v1:mem:msg:(.+)$/))) {
      if (!(await isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
      await ctx.answerCallbackQuery()
      const user = await prisma.user.findUnique({ where: { id: m[1] }, select: { name: true, telegramChatId: true } })
      if (!user?.telegramChatId) { await ctx.editMessageText('⚠️ Telegram non collegato.', { reply_markup: new InlineKeyboard().text('← Indietro', 'v1:sec:members') }); return }
      await ctx.conversation.enter('sendDirectMessage')
      return
    }

    // Membro pubblico
    if (data === 'v1:link:request') { await handleMemberLinkRequest(ctx); return }
    if (data === 'v1:me:rank') { await handleMemberRank(ctx); return }
    if (data === 'v1:me:mission') { await handleMemberMission(ctx); return }
    if (data === 'v1:me:payout') { await handleMemberPayout(ctx); return }
    if (data === 'v1:me:faq') { await handleMemberFAQ(ctx); return }
    if (data === 'v1:me:support') {
      await ctx.answerCallbackQuery()
      await ctx.editMessageText(
        '📨 <b>Supporto</b>\n\nScrivi il tuo messaggio nella chat. Il Comando ti risponderà direttamente qui.',
        { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Menu', 'v1:member:home') }
      )
      return
    }

    await ctx.answerCallbackQuery()
  })

  // ── MESSAGGI TESTO ──
  // Broadcast in attesa (admin)
  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message?.text || ''
    if (text.startsWith('/')) return next()
    if (await isAdmin(ctx)) {
      const handled = await handleBroadcastText(ctx)
      if (handled) return
    }
    return next()
  })

  // AI Filter per membri (deve essere dopo tutto)
  bot.use(buildAIFilter(bot, auth))

  bot.catch((err) => { console.error('[bot] error:', err.message) })
}

// ── HELPERS ──

async function sendAdminHome(ctx) {
  const text = await buildAdminHomeText()
  return ctx.reply(text, { parse_mode: 'HTML', reply_markup: buildAdminHomeKb() })
}

async function editAdminHome(ctx) {
  const text = await buildAdminHomeText()
  return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: buildAdminHomeKb() })
}

async function buildAdminHomeText() {
  const [po, pp] = await Promise.all([
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.payoutRequest.count({ where: { status: 'PENDING' } }),
  ])
  const openSupport = await prisma.supportConversation.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }).catch(() => 0)
  const alerts = []
  if (po > 0) alerts.push(`🎖 <b>${po}</b> promozioni in attesa`)
  if (pp > 0) alerts.push(`💰 <b>${pp}</b> rimborsi in attesa`)
  if (openSupport > 0) alerts.push(`💬 <b>${openSupport}</b> conversazioni aperte`)
  return `⚡ <b>CENTRO DI COMANDO VOLTRA</b>\n<code>Stato: operativo</code>` +
    (alerts.length ? '\n\n' + alerts.join('\n') : '') + '\n\nSeleziona:'
}

function buildAdminHomeKb() {
  return new InlineKeyboard()
    .text('🎖 Promozioni', 'v1:sec:orders').row()
    .text('💰 Rimborsi', 'v1:sec:payouts').row()
    .text('⚔️ Missioni', 'v1:sec:missions').row()
    .text('👥 Membri', 'v1:sec:members').row()
    .text('💳 Abbonamenti', 'v1:sec:subs').row()
    .text('💬 Supporto', 'v1:sec:support').row()
    .text('📊 Rapporto', 'v1:sec:stats').text('⚙️ Impostazioni', 'v1:sec:settings').row()
    .text('📢 Ordine del Giorno', 'v1:sec:broadcast').row()
}

async function handleMembersList(ctx) {
  await ctx.answerCallbackQuery()
  try {
    const members = await prisma.user.findMany({
      where: { role: 'TRADER', approved: true },
      orderBy: { createdAt: 'desc' }, take: 10,
      select: { id: true, name: true, rank: true, matricola: true },
    })
    const total = await prisma.user.count({ where: { role: 'TRADER', approved: true } })
    const kb = new InlineKeyboard()
    for (const m of members) {
      kb.text(`${m.name} · ${m.rank || 'Recluta'}`.substring(0, 40), `v1:mem:view:${m.id}`).row()
    }
    kb.text('← Home', 'v1:home')
    await ctx.editMessageText(
      total === 0
        ? '👥 <b>Membri</b>\n\nNessun membro approvato.'
        : `👥 <b>Membri</b> (${total})\n\nPrimi ${members.length} mostrati:`,
      { parse_mode: 'HTML', reply_markup: kb }
    )
  } catch (e) {
    console.error('[bot/members]', e.message)
    await ctx.editMessageText(`⚠️ Errore: ${e.message}`, { reply_markup: new InlineKeyboard().text('← Home', 'v1:home') })
  }
}

async function handleMemberView(ctx, userId) {
  await ctx.answerCallbackQuery()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      propAccounts: { where: { status: 'ACTIVE' }, include: { program: true }, take: 1 },
      orders: { where: { status: 'PENDING' }, take: 1 },
    },
  })
  if (!user) { return ctx.editMessageText('Membro non trovato.', { reply_markup: new InlineKeyboard().text('← Indietro', 'v1:sec:members') }) }
  const account = user.propAccounts[0]
  const text =
    `👤 <b>${escapeHtml(user.name)}</b>\n` +
    `Matricola: <code>${escapeHtml(user.matricola || 'N/D')}</code>\n` +
    `Grado: <b>${escapeHtml(user.rank || 'Recluta')}</b>\n` +
    `Email: ${escapeHtml(user.email)}\n` +
    `Telegram: ${user.telegramChatId ? '✅ collegato' : '❌ non collegato'}\n` +
    (account ? `\nMissione: 🟢 <b>${escapeHtml(account.program?.name || 'N/D')}</b> · $${Number(account.startBalance).toLocaleString()}` : '\nMissione: nessuna attiva') +
    `\nArruolato: ${new Date(user.createdAt).toLocaleDateString('it-IT')}`
  const kb = new InlineKeyboard()
  if (user.telegramChatId) kb.text('💬 Invia messaggio', `v1:mem:msg:${userId}`).row()
  kb.text('← Membri', 'v1:sec:members')
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb })
}
