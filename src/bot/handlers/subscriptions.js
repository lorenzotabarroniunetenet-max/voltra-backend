import { Composer, InlineKeyboard } from 'grammy'
import { prisma } from '../../lib/prisma.js'
import { escapeHtml } from '../notify.js'

export function buildSubscriptionHandlers(auth) {
  const composer = new Composer()

  // Entry point
  composer.callbackQuery('v1:sec:subs', async (ctx) => {
    if (!(await auth.isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    await ctx.answerCallbackQuery()
    await renderSubsList(ctx)
  })

  composer.callbackQuery(/^v1:subs:filter:(.+)$/, async (ctx) => {
    if (!(await auth.isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    await ctx.answerCallbackQuery()
    await renderSubsList(ctx, ctx.match[1])
  })

  composer.callbackQuery(/^v1:sub:view:(.+)$/, async (ctx) => {
    if (!(await auth.isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    await ctx.answerCallbackQuery()
    await renderSubDetail(ctx, ctx.match[1])
  })

  composer.callbackQuery(/^v1:sub:renew:(.+)$/, async (ctx) => {
    if (!(await auth.isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    const subId = ctx.match[1]
    try {
      const sub = await prisma.subscription.findUnique({ where: { id: subId } })
      if (!sub) { await ctx.answerCallbackQuery({ text: 'Non trovato', show_alert: true }); return }
      const base = new Date(sub.endDate) > new Date() ? new Date(sub.endDate) : new Date()
      const newEnd = new Date(base); newEnd.setMonth(newEnd.getMonth() + 1)
      await prisma.subscription.update({ where: { id: subId }, data: { endDate: newEnd, status: 'ACTIVE' } })
      await ctx.answerCallbackQuery({ text: '✅ Rinnovato +1 mese' })
      await renderSubDetail(ctx, subId)
    } catch (e) {
      await ctx.answerCallbackQuery({ text: 'Errore: ' + e.message, show_alert: true })
    }
  })

  composer.callbackQuery(/^v1:sub:suspend:(.+)$/, async (ctx) => {
    if (!(await auth.isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    try {
      await prisma.subscription.update({ where: { id: ctx.match[1] }, data: { status: 'SUSPENDED' } })
      await ctx.answerCallbackQuery({ text: '⏸ Sospeso' })
      await renderSubDetail(ctx, ctx.match[1])
    } catch (e) { await ctx.answerCallbackQuery({ text: 'Errore', show_alert: true }) }
  })

  composer.callbackQuery(/^v1:sub:activate:(.+)$/, async (ctx) => {
    if (!(await auth.isAdmin(ctx))) { await ctx.answerCallbackQuery({ text: '⛔', show_alert: true }); return }
    try {
      await prisma.subscription.update({ where: { id: ctx.match[1] }, data: { status: 'ACTIVE' } })
      await ctx.answerCallbackQuery({ text: '✅ Attivato' })
      await renderSubDetail(ctx, ctx.match[1])
    } catch (e) { await ctx.answerCallbackQuery({ text: 'Errore', show_alert: true }) }
  })

  return composer
}

async function renderSubsList(ctx, filter = 'all') {
  const now = new Date()
  const in7 = new Date(now); in7.setDate(in7.getDate() + 7)

  let where = {}
  if (filter === 'active') where = { status: 'ACTIVE' }
  else if (filter === 'expiring') where = { status: 'ACTIVE', endDate: { lte: in7 } }
  else if (filter === 'expired') where = { status: { in: ['EXPIRED', 'SUSPENDED'] } }

  const subs = await prisma.subscription.findMany({
    where, orderBy: { endDate: 'asc' }, take: 15,
    include: { user: { select: { name: true, matricola: true } } },
  })

  const totals = await prisma.subscription.groupBy({
    by: ['status'], _count: true,
  })
  const counts = Object.fromEntries(totals.map(t => [t.status, t._count]))

  const lines = subs.map(s => {
    const days = Math.ceil((new Date(s.endDate) - now) / 86400000)
    const icon = s.status === 'ACTIVE' ? (days <= 7 ? '⚠️' : '✅') : s.status === 'SUSPENDED' ? '⏸' : '🔴'
    return `${icon} <b>${escapeHtml(s.user?.name)}</b> · ${days > 0 ? `${days}gg` : 'scaduto'}`
  }).join('\n') || 'Nessun abbonamento.'

  const kb = new InlineKeyboard()
    .text(`Tutti (${(counts.ACTIVE||0)+(counts.EXPIRED||0)+(counts.SUSPENDED||0)})`, 'v1:subs:filter:all')
    .text(`✅ Attivi (${counts.ACTIVE||0})`, 'v1:subs:filter:active').row()
    .text(`⚠️ In scadenza`, 'v1:subs:filter:expiring')
    .text(`🔴 Scaduti (${(counts.EXPIRED||0)+(counts.SUSPENDED||0)})`, 'v1:subs:filter:expired').row()

  subs.slice(0, 8).forEach(s => kb.text(s.user?.name?.substring(0,25) || s.id, `v1:sub:view:${s.id}`).row())
  kb.text('← Home', 'v1:home')

  await ctx.editMessageText(
    `💳 <b>Abbonamenti</b>\n\n${lines}`,
    { parse_mode: 'HTML', reply_markup: kb }
  )
}

async function renderSubDetail(ctx, subId) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subId },
    include: { user: { select: { name: true, email: true, matricola: true, telegramChatId: true } } },
  })
  if (!sub) { await ctx.editMessageText('Non trovato.', { reply_markup: new InlineKeyboard().text('← Abbonamenti', 'v1:sec:subs') }); return }

  const now = new Date()
  const days = Math.ceil((new Date(sub.endDate) - now) / 86400000)
  const statusIcon = sub.status === 'ACTIVE' ? (days <= 7 ? '⚠️' : '✅') : sub.status === 'SUSPENDED' ? '⏸' : '🔴'

  const text = [
    `💳 <b>Abbonamento</b>`,
    `👤 <b>${escapeHtml(sub.user?.name)}</b> · <code>${escapeHtml(sub.user?.matricola || '—')}</code>`,
    `📧 ${escapeHtml(sub.user?.email)}`,
    ``,
    `Stato: ${statusIcon} <b>${sub.status}</b>`,
    `Importo: <b>€${Number(sub.amount).toFixed(2)}</b>/mese`,
    `Inizio: ${new Date(sub.startDate).toLocaleDateString('it-IT')}`,
    `Scadenza: <b>${new Date(sub.endDate).toLocaleDateString('it-IT')}</b>`,
    days > 0 ? `Rimangono: <b>${days} giorni</b>` : `<b>SCADUTO</b>`,
    sub.notes ? `\nNote: <i>${escapeHtml(sub.notes)}</i>` : '',
  ].filter(Boolean).join('\n')

  const kb = new InlineKeyboard()
    .text('🔄 Rinnova +1 mese', `v1:sub:renew:${sub.id}`).row()

  if (sub.status === 'ACTIVE') {
    kb.text('⏸ Sospendi', `v1:sub:suspend:${sub.id}`).row()
  } else {
    kb.text('✅ Riattiva', `v1:sub:activate:${sub.id}`).row()
  }
  kb.text('← Abbonamenti', 'v1:sec:subs')

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb })
}
