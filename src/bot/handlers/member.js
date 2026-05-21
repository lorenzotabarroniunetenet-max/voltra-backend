import { prisma } from '../../lib/prisma.js'
import { escapeHtml, memberHomeKeyboard, backHomeKeyboard } from '../keyboards.js'
import { InlineKeyboard } from 'grammy'

async function getLinkedUser(chatId) {
  return prisma.user.findFirst({
    where: { telegramChatId: String(chatId) },
    include: {
      propAccounts: {
        where: { status: { in: ['ACTIVE', 'PASSED', 'PAID_OUT'] } },
        include: { program: true },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  })
}

export async function handleMemberRank(ctx) {
  await ctx.answerCallbackQuery()
  const user = await getLinkedUser(ctx.from.id)
  if (!user) return ctx.editMessageText('Account non collegato.', { reply_markup: memberHomeKeyboard(false) })
  await ctx.editMessageText(
    `🎖 <b>Il tuo grado</b>\n\n` +
    `Nome: <b>${escapeHtml(user.name)}</b>\n` +
    `Matricola: <code>${escapeHtml(user.matricola || 'N/D')}</code>\n` +
    `Grado: <b>${escapeHtml(user.rank || 'Recluta')}</b>`,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Menu', 'v1:member:home') }
  )
}

export async function handleMemberMission(ctx) {
  await ctx.answerCallbackQuery()
  const user = await getLinkedUser(ctx.from.id)
  if (!user) return ctx.editMessageText('Account non collegato.', { reply_markup: memberHomeKeyboard(false) })
  const account = user.propAccounts[0]
  if (!account) {
    return ctx.editMessageText(
      '⚔️ <b>Stato missione</b>\n\nNessuna missione attiva. Acquista una promozione su voltrasolutions.com.',
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Menu', 'v1:member:home') }
    )
  }
  const statusLabel = { ACTIVE: '🟢 In corso', PASSED: '🏅 Compiuta', FAILED: '🔴 Fallita', PAID_OUT: '💰 Liquidata' }
  await ctx.editMessageText(
    `⚔️ <b>Stato missione</b>\n\n` +
    `Pool: <b>VOLTRA LIQUIDITY GRAB POOL</b>\n` +
    `Programma: <b>${escapeHtml(account.program?.name || 'N/D')}</b>\n` +
    `Dotazione: <b>$${Number(account.startBalance).toLocaleString()}</b>\n` +
    `Stato: ${statusLabel[account.status] || account.status}`,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Menu', 'v1:member:home') }
  )
}

export async function handleMemberPayout(ctx) {
  await ctx.answerCallbackQuery()
  const user = await getLinkedUser(ctx.from.id)
  if (!user) return ctx.editMessageText('Account non collegato.', { reply_markup: memberHomeKeyboard(false) })
  await ctx.editMessageText(
    `💰 <b>Rimborso missione</b>\n\nPer richiedere il rimborso vai su voltrasolutions.com nella sezione dedicata.\n\nIl rimborso viene sbloccato dal Comando al completamento della missione.`,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Menu', 'v1:member:home') }
  )
}

export async function handleMemberFAQ(ctx) {
  await ctx.answerCallbackQuery()
  await ctx.editMessageText(
    `❓ <b>FAQ</b>\n\n` +
    `<b>Come collego il mio account?</b>\nVai su voltrasolutions.com → Personale → Collega Telegram.\n\n` +
    `<b>Quando arriva il rimborso?</b>\nIl Comando sblocca il rimborso al completamento della missione. Riceverai notifica qui.\n\n` +
    `<b>Come cambio la mia password?</b>\nDal sito → Personale → Impostazioni.\n\n` +
    `<b>Ho un problema tecnico?</b>\nUsa il bottone Supporto nel menu per contattare il Comando.`,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Menu', 'v1:member:home') }
  )
}

export async function handleMemberLinkRequest(ctx) {
  await ctx.answerCallbackQuery()
  await ctx.editMessageText(
    `🔗 <b>Collega il tuo account</b>\n\nPer collegare il tuo account Voltra a Telegram:\n\n1. Accedi a <b>voltrasolutions.com</b>\n2. Vai su <b>Personale</b>\n3. Clicca su <b>Collega Telegram</b>\n4. Apri il link generato\n\nHai 10 minuti per completare il collegamento.`,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('← Indietro', 'v1:member:home') }
  )
}
