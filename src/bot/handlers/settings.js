import { Composer, InlineKeyboard } from 'grammy'
import { escapeHtml } from '../notify.js'
import { prisma } from '../../lib/prisma.js'
import { getSetting, setSetting } from '../../lib/settings.js'

export function buildSettingsHandlers(bot, auth) {
  const composer = new Composer()

  composer.callbackQuery('v1:sec:settings', async (ctx) => {
    if (!(await auth.isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔ Solo Superadmin', show_alert: true }); return }
    await ctx.answerCallbackQuery().catch(() => {})
    await renderSettings(ctx)
  })

  composer.callbackQuery('v1:set:ai:on', async (ctx) => {
    if (!(await auth.isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    await setSetting('AI_KILL_SWITCH', 'off')
    await ctx.answerCallbackQuery({ text: '🟢 Bot AI attivato' })
    await renderSettings(ctx)
  })

  composer.callbackQuery('v1:set:ai:off', async (ctx) => {
    if (!(await auth.isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    await setSetting('AI_KILL_SWITCH', 'on')
    await ctx.answerCallbackQuery({ text: '🔴 Bot AI disattivato' })
    await renderSettings(ctx)
  })

  composer.callbackQuery('v1:set:addmod', async (ctx) => {
    if (!(await auth.isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    await ctx.answerCallbackQuery().catch(() => {})
    await ctx.conversation.enter('addModerator')
  })

  composer.callbackQuery('v1:set:mods', async (ctx) => {
    if (!(await auth.isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    await ctx.answerCallbackQuery().catch(() => {})
    await renderModList(ctx, false)
  })

  composer.callbackQuery('v1:set:mods:rem', async (ctx) => {
    if (!(await auth.isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    await ctx.answerCallbackQuery().catch(() => {})
    await renderModList(ctx, true)
  })

  composer.callbackQuery(/^v1:mod:rem:(.+)$/, async (ctx) => {
    if (!(await auth.isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    const idToRemove = ctx.match[1]
    const existing = await getSetting('TELEGRAM_MOD_IDS', '')
    const ids = existing.split(',').map(s => s.trim()).filter(Boolean).filter(id => id !== idToRemove)
    await setSetting('TELEGRAM_MOD_IDS', ids.join(','))
    await ctx.answerCallbackQuery({ text: 'Moderatore rimosso.' })
    await ctx.editMessageText(`✅ Rimosso: <code>${escapeHtml(idToRemove)}</code>`, {
      parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Impostazioni', 'v1:sec:settings'),
    })
  })

  composer.callbackQuery('v1:set:msg', async (ctx) => {
    if (!(await auth.isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    await ctx.answerCallbackQuery().catch(() => {})
    await ctx.conversation.enter('sendDirectMessage')
  })

  composer.callbackQuery('v1:set:welcome', async (ctx) => {
    if (!(await auth.isSuperAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    await ctx.answerCallbackQuery().catch(() => {})
    await ctx.conversation.enter('setWelcomeMessage')
  })

  return composer
}

async function renderSettings(ctx) {
  const aiEnabled = await getSetting('AI_KILL_SWITCH', 'off')
  const aiOff = aiEnabled === 'on' || aiEnabled === 'true'
  const mods = await getSetting('TELEGRAM_MOD_IDS', '')
  const modCount = mods.split(',').filter(Boolean).length
  const kb = new InlineKeyboard()
    .text(`🤖 Bot AI: ${aiOff ? '🔴 OFF' : '🟢 ON'}`, aiOff ? 'v1:set:ai:on' : 'v1:set:ai:off').row()
    .text('📨 Messaggio a membro', 'v1:set:msg').row()
    .text('➕ Aggiungi moderatore', 'v1:set:addmod').row()
    .text(`👥 Lista mod (${modCount})`, 'v1:set:mods').text('➖ Rimuovi mod', 'v1:set:mods:rem').row()
    .text('👋 Msg. benvenuto', 'v1:set:welcome').row()
    .text('← Home', 'v1:home')
  await ctx.editMessageText(
    `⚙️ <b>Impostazioni Superadmin</b>\n\nBot AI: <b>${aiOff ? '🔴 Disattivato' : '🟢 Attivo'}</b>\nModeratori: <b>${modCount}</b>`,
    { parse_mode: 'HTML', reply_markup: kb }
  )
}

async function renderModList(ctx, removeMode) {
  const setting = await getSetting('TELEGRAM_MOD_IDS', '')
  const ids = setting.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) {
    return ctx.editMessageText('Nessun moderatore configurato.', {
      reply_markup: new InlineKeyboard().text('← Impostazioni', 'v1:sec:settings'),
    })
  }
  const users = await prisma.user.findMany({
    where: { telegramChatId: { in: ids } },
    select: { telegramChatId: true, name: true, email: true, matricola: true },
  })
  const map = new Map(users.map(u => [u.telegramChatId, u]))
  const lines = ids.map((id, i) => {
    const u = map.get(id)
    return `${i + 1}. <code>${escapeHtml(id)}</code>  ${u ? escapeHtml(u.name || u.email) : '<i>non collegato</i>'}`
  })
  const kb = new InlineKeyboard()
  if (removeMode) {
    for (const id of ids) {
      const u = map.get(id)
      kb.text(`🗑 ${(u && (u.name || u.email)) || id}`.substring(0, 30), `v1:mod:rem:${id}`).row()
    }
  }
  kb.text('← Impostazioni', 'v1:sec:settings')
  await ctx.editMessageText(
    `👥 <b>Moderatori (${ids.length})</b>\n\n${lines.join('\n')}`,
    { parse_mode: 'HTML', reply_markup: kb }
  )
}

// ── CONVERSATIONS ──

export async function addModeratorConvo(conversation, ctx) {
  await ctx.reply('Inserisci il <b>Chat ID Telegram</b> del moderatore:\n(<code>/annulla</code> per uscire)', { parse_mode: 'HTML' })
  const { message } = await conversation.waitFor('message:text')
  if (message.text === '/annulla') { await ctx.reply('Annullato.'); return }
  const newId = message.text.trim()
  if (!/^-?\d+$/.test(newId)) { await ctx.reply('❌ Chat ID non valido (deve essere un numero).'); return }
  await conversation.external(async () => {
    const existing = await getSetting('TELEGRAM_MOD_IDS', '')
    const cur = existing.split(',').map(s => s.trim()).filter(Boolean)
    if (!cur.includes(newId)) cur.push(newId)
    await setSetting('TELEGRAM_MOD_IDS', cur.join(','))
  })
  await ctx.reply(`✅ Moderatore <code>${escapeHtml(newId)}</code> aggiunto. Può ora approvare promozioni.`, {
    parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Impostazioni', 'v1:sec:settings'),
  })
}

export async function sendDirectMessageConvo(conversation, ctx) {
  await ctx.reply('Inserisci <b>Chat ID</b> o <b>matricola</b> del destinatario:\n(<code>/annulla</code> per uscire)', { parse_mode: 'HTML' })
  const { message: idMsg } = await conversation.waitFor('message:text')
  if (idMsg.text === '/annulla') { await ctx.reply('Annullato.'); return }
  const target = idMsg.text.trim()
  const user = await conversation.external(() =>
    prisma.user.findFirst({ where: { OR: [{ telegramChatId: target }, { matricola: target }] } })
  )
  if (!user?.telegramChatId) { await ctx.reply('❌ Membro non trovato o Telegram non collegato.'); return }
  await ctx.reply(`Destinatario: <b>${escapeHtml(user.name)}</b>\nOra scrivi il messaggio:`, { parse_mode: 'HTML' })
  const { message: bodyMsg } = await conversation.waitFor('message:text')
  if (bodyMsg.text === '/annulla') { await ctx.reply('Annullato.'); return }
  await conversation.external(async () => {
    const { bot } = await import('../index.js')
    await bot.api.sendMessage(Number(user.telegramChatId), `🛡 <b>Comunicazione dal Comando</b>\n\n${escapeHtml(bodyMsg.text)}`, { parse_mode: 'HTML' })
  })
  await ctx.reply('✅ Messaggio recapitato.')
}

export async function setWelcomeMessageConvo(conversation, ctx) {
  await ctx.reply('Invia il nuovo messaggio di benvenuto (HTML, max 2000 caratteri):\n(<code>/annulla</code> per uscire)', { parse_mode: 'HTML' })
  const { message } = await conversation.waitFor('message:text')
  if (message.text === '/annulla') { await ctx.reply('Annullato.'); return }
  await conversation.external(() => setSetting('WELCOME_MESSAGE', message.text.slice(0, 2000)))
  await ctx.reply('✅ Messaggio di benvenuto aggiornato.')
}
