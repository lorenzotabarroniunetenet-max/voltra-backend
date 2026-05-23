import cron from 'node-cron'
import { prisma } from './prisma-ref.js'
import { notifyMember } from '../bot/notify.js'

export function startSubscriptionCron(bot) {
  const tz = process.env.CRON_TIMEZONE || 'Europe/Rome'

  // Ogni giorno alle 09:30 — controlla scadenze
  cron.schedule('30 9 * * *', () => checkSubscriptions(bot), { timezone: tz })
  console.log('[cron] subscription checker scheduled')
}

async function checkSubscriptions(bot) {
  const now = new Date()
  const in7 = new Date(now); in7.setDate(in7.getDate() + 7)
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)

  // Scadono nei prossimi 7 giorni → avvisa membro
  const expiringSoon = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      endDate: { gte: now, lte: in7 },
    },
    include: { user: true },
  })

  for (const sub of expiringSoon) {
    const days = Math.ceil((new Date(sub.endDate) - now) / 86400000)
    await notifyMember(bot, sub.user, 'subscription_expiring', { days, endDate: sub.endDate })
    await sleep(50)
  }

  // Scaduti oggi → marca come EXPIRED
  const expired = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', endDate: { lt: now } },
    include: { user: true },
  })

  for (const sub of expired) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } })
    await notifyMember(bot, sub.user, 'subscription_expired', {})
    await sleep(50)
  }

  // Avvisa admin se ci sono scadenze oggi o domani
  const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID
  if (adminChat && (expiringSoon.length > 0 || expired.length > 0)) {
    let msg = `💳 <b>Riepilogo abbonamenti</b>\n\n`
    if (expired.length > 0) msg += `🔴 <b>Scaduti oggi: ${expired.length}</b>\n` + expired.map(s => `  • ${s.user.name} (${s.user.matricola || '—'})`).join('\n') + '\n\n'
    if (expiringSoon.length > 0) msg += `⚠️ <b>Scadono entro 7 giorni: ${expiringSoon.length}</b>\n` + expiringSoon.map(s => {
      const d = Math.ceil((new Date(s.endDate) - now) / 86400000)
      return `  • ${s.user.name} — ${d}gg`
    }).join('\n')
    await bot.api.sendMessage(Number(adminChat), msg, { parse_mode: 'HTML' }).catch(e => console.warn('[sub cron]', e.message))
  }

  if (expiringSoon.length || expired.length) {
    console.log(`[cron] subscriptions: ${expired.length} expired, ${expiringSoon.length} expiring soon`)
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
