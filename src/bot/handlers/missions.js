import { prisma } from '../../lib/prisma.js'
import { InlineKeyboard } from 'grammy'
import { missionDetailKeyboard, missionConfirmKeyboard, escapeHtml, backHomeKeyboard } from '../keyboards.js'
import { notifyMember } from '../notify.js'

export async function handleMissionsList(ctx) {
  await ctx.answerCallbackQuery()
  const accounts = await prisma.propAccount.findMany({
    where: { status: 'ACTIVE' },
    include: { user: { select: { name: true, matricola: true } }, program: true },
    orderBy: { startedAt: 'desc' },
    take: 8,
  })
  const total = await prisma.propAccount.count({ where: { status: 'ACTIVE' } })
  const kb = new InlineKeyboard()
  for (const a of accounts) {
    const label = `⚔️ ${a.user?.name || 'N/D'} — ${a.program?.name || 'N/D'}`
    kb.text(label.substring(0, 40), `v1:m:view:${a.id}`).row()
  }
  kb.text('← Home', 'v1:home')
  await ctx.editMessageText(
    total === 0
      ? '⚔️ <b>Missioni</b>\n\nNessuna missione attiva.'
      : `⚔️ <b>Missioni attive</b> (${total})\n\nSeleziona:`,
    { parse_mode: 'HTML', reply_markup: kb }
  )
}

export async function handleMissionView(ctx, accountId) {
  await ctx.answerCallbackQuery()
  const account = await prisma.propAccount.findUnique({
    where: { id: accountId },
    include: { user: { select: { name: true, matricola: true, rank: true } }, program: true },
  })
  if (!account) {
    return ctx.editMessageText('Missione non trovata.', { reply_markup: backHomeKeyboard() })
  }
  const statusLabel = { ACTIVE: '🟢 In corso', PASSED: '🏅 Compiuta', FAILED: '🔴 Fallita', PAID_OUT: '💰 Liquidata' }
  const text =
    `⚔️ <b>Missione</b>\n\n` +
    `👤 <b>${escapeHtml(account.user?.name)}</b> · <code>${escapeHtml(account.user?.matricola || 'N/D')}</code>\n` +
    `🎖 Grado: <b>${escapeHtml(account.user?.rank || 'N/D')}</b>\n` +
    `📋 Programma: <b>${escapeHtml(account.program?.name || 'N/D')}</b>\n` +
    `💵 Dotazione: <b>$${Number(account.startBalance).toLocaleString()}</b>\n` +
    `📅 Avviata: <b>${new Date(account.startedAt).toLocaleDateString('it-IT')}</b>\n` +
    `Stato: ${statusLabel[account.status] || account.status}`
  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: missionDetailKeyboard(accountId),
  })
}

export async function handleMissionAction(ctx, action, accountId) {
  await ctx.answerCallbackQuery()
  await ctx.editMessageText(
    `⚠️ <b>Conferma</b>\n\nConfermi di voler impostare: <b>${action}</b>?`,
    { parse_mode: 'HTML', reply_markup: missionConfirmKeyboard(action, accountId) }
  )
}

export async function handleMissionConfirm(ctx, action, accountId) {
  await ctx.answerCallbackQuery()
  try {
    if (action === 'payout') {
      // Sblocca rimborso: metti eligible flag su account (gestiamo con notes o campo dedicato)
      await prisma.propAccount.update({
        where: { id: accountId },
        data: { notes: 'PAYOUT_ELIGIBLE' },
      })
      await ctx.editMessageText('🔓 <b>Rimborso sbloccato.</b>\n\nIl membro può ora richiedere il rimborso missione.', {
        parse_mode: 'HTML', reply_markup: backHomeKeyboard(),
      })
    } else {
      const validStatuses = ['ACTIVE', 'PASSED', 'FAILED', 'PAID_OUT']
      if (!validStatuses.includes(action)) throw new Error('Stato non valido')
      const account = await prisma.propAccount.update({
        where: { id: accountId },
        data: { status: action, endedAt: action !== 'ACTIVE' ? new Date() : null },
        include: { user: { select: { id: true, name: true, telegramChatId: true, matricola: true } } },
      })
      // Notifica membro
      if (account.user?.telegramChatId) {
        const { bot } = await import('../index.js')
        await notifyMember(bot, account.user, 'mission_updated', { status: action }).catch(() => {})
      }
      await ctx.editMessageText(
        `✅ <b>Stato missione aggiornato</b>\n\nMissione di <b>${escapeHtml(account.user?.name)}</b> impostata a <b>${action}</b>.`,
        { parse_mode: 'HTML', reply_markup: backHomeKeyboard() }
      )
    }
  } catch (e) {
    console.error('[bot/missions] confirm error:', e.message)
    await ctx.editMessageText('Errore durante l\'operazione. Riprova.', { reply_markup: backHomeKeyboard() })
  }
}
