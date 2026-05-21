import cron from 'node-cron'
import { notifyMember } from '../bot/notify.js'
import { prisma } from './prisma-ref.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const pad = n => String(n).padStart(2, '0')

export function startNotificationCrons(bot) {
  const tz = process.env.CRON_TIMEZONE || 'Europe/Rome'

  // Reminder settimanale: lunedì 09:00
  cron.schedule('0 9 * * 1', () => safeRun('weekly_mission_reminder', () => weeklyMissionReminder(bot)), { timezone: tz })

  // Anniversari: ogni giorno 09:00
  cron.schedule('0 9 * * *', () => safeRun('anniversary', () => anniversaryCheck(bot)), { timezone: tz })

  console.log(`[cron] notifications scheduled tz=${tz}`)
}

async function safeRun(name, fn) {
  try {
    await fn()
    await prisma.setting.upsert({
      where: { key: `cron:${name}:lastRun` },
      create: { key: `cron:${name}:lastRun`, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    })
    console.log(`[cron] ${name} OK`)
  } catch (e) {
    console.error(`[cron] ${name} FAILED: ${e.message}`)
  }
}

async function weeklyMissionReminder(bot) {
  const users = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      propAccounts: { some: { status: { in: ['ACTIVE', 'PASSED'] } } },
    },
    include: {
      propAccounts: {
        where: { status: { in: ['ACTIVE', 'PASSED'] } },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  })
  for (const u of users) {
    const status = u.propAccounts[0]?.status || '—'
    await notifyMember(bot, u, 'weekly_mission', { status })
    await sleep(50)
  }
}

async function anniversaryCheck(bot) {
  const now = new Date()
  const todayMD = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null }, enrolledAt: { not: null } },
    select: { id: true, name: true, email: true, telegramChatId: true, enrolledAt: true, matricola: true },
  })
  for (const u of users) {
    const e = u.enrolledAt
    const md = `${pad(e.getMonth() + 1)}-${pad(e.getDate())}`
    if (md !== todayMD) continue
    const years = now.getFullYear() - e.getFullYear()
    if (years <= 0) continue
    await notifyMember(bot, u, 'anniversary', { years })
    await sleep(50)
  }
}
