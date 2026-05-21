import { prisma } from '../../lib/prisma.js'
import { isAdmin } from '../auth.js'
import { adminHomeKeyboard, memberHomeKeyboard, escapeHtml } from '../keyboards.js'
import { getSetting } from '../../lib/settings.js'

export async function handleStart(ctx) {
  const payload = ctx.match // token dal deep-link /start <token>
  const chatId = ctx.from.id
  const admin = await isAdmin(ctx)

  // --- LINKING FLOW ---
  if (payload && payload.length > 0) {
    const token = payload.trim()
    try {
      const link = await prisma.telegramLinkToken.findUnique({
        where: { token },
        include: { user: true },
      })

      if (!link || link.usedAt || link.expiresAt < new Date()) {
        return ctx.reply(
          '⚠️ <b>Link non valido o scaduto.</b>\n\nRichiedi un nuovo link dalla tua area riservata su voltrasolutions.com.',
          { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
        )
      }

      // Collega il telegramChatId all'utente
      await prisma.$transaction([
        prisma.user.update({
          where: { id: link.userId },
          data: { telegramChatId: String(chatId) },
        }),
        prisma.telegramLinkToken.update({
          where: { token },
          data: { usedAt: new Date() },
        }),
      ])

      // Log nel registro di servizio
      await prisma.serviceLogEntry.create({
        data: {
          userId: link.userId,
          type: 'note',
          title: 'Account Telegram collegato',
          body: `Chat ID: ${chatId}`,
          iconKey: 'star',
        },
      }).catch(() => {})

      const user = link.user
      const welcomeSetting = await getSetting('WELCOME_MESSAGE', '')
      const welcomeText = welcomeSetting ||
        `✅ <b>Account collegato.</b>\n\n` +
        `Benvenuto, <b>${escapeHtml(user.name)}</b>.\n` +
        `Grado: <b>${escapeHtml(user.rank || 'Recluta')}</b> · Matricola: <code>${escapeHtml(user.matricola || 'N/D')}</code>\n\n` +
        `Usa il menu qui sotto per consultare la tua missione e ricevere gli ordini del Comando.`
      await ctx.reply(welcomeText, { parse_mode: 'HTML', reply_markup: memberHomeKeyboard(true) })
    } catch (e) {
      console.error('[bot/start] link error:', e.message)
      await ctx.reply('Errore durante il collegamento. Riprova o contatta il supporto.')
    }
    return
  }

  // --- ADMIN HOME ---
  if (admin) {
    const [pendingOrders, pendingPayouts] = await Promise.all([
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.payoutRequest.count({ where: { status: 'PENDING' } }),
    ])
    const alerts = []
    if (pendingOrders > 0) alerts.push(`🎖 <b>${pendingOrders}</b> promozioni in attesa`)
    if (pendingPayouts > 0) alerts.push(`💰 <b>${pendingPayouts}</b> rimborsi in attesa`)
    const alertLine = alerts.length > 0 ? '\n\n' + alerts.join('\n') : ''

    return ctx.reply(
      `⚡ <b>CENTRO DI COMANDO VOLTRA</b>\n` +
      `<code>Stato: operativo</code>${alertLine}\n\n` +
      `Seleziona una sezione:`,
      { parse_mode: 'HTML', reply_markup: adminHomeKeyboard() }
    )
  }

  // --- MEMBRO NON COLLEGATO ---
  const existing = await prisma.user.findFirst({
    where: { telegramChatId: String(chatId) },
  })
  if (existing) {
    return ctx.reply(
      `⚡ <b>VOLTRA COMANDO</b>\n\n` +
      `Benvenuto, <b>${escapeHtml(existing.name)}</b>.\n` +
      `Grado: <b>${escapeHtml(existing.rank || 'Recluta')}</b>`,
      { parse_mode: 'HTML', reply_markup: memberHomeKeyboard(true) }
    )
  }

  return ctx.reply(
    `⚡ <b>VOLTRA COMANDO</b>\n\n` +
    `Centro di Comando del club Voltra.\n` +
    `Per accedere collega il tuo account Voltra.`,
    { parse_mode: 'HTML', reply_markup: memberHomeKeyboard(false) }
  )
}
