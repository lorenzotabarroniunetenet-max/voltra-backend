import cron from 'node-cron'
import { prisma } from './prisma-ref.js'
import { sendOnboardingEmail } from '../lib/email.js'

export function startOnboardingCron() {
  const tz = process.env.CRON_TIMEZONE || 'Europe/Rome'
  cron.schedule('0 9 * * *', () => runOnboarding(), { timezone: tz })
  console.log('[cron] onboarding email scheduled')
}

async function runOnboarding() {
  const now = new Date()
  const days = [1, 3, 7]

  for (const day of days) {
    const from = new Date(now)
    from.setDate(from.getDate() - day)
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setHours(23, 59, 59, 999)

    const members = await prisma.user.findMany({
      where: {
        role: 'TRADER',
        approved: true,
        enrolledAt: { gte: from, lte: to },
      },
      select: { id: true, name: true, email: true, rank: true, matricola: true, memberNumber: true },
    })

    for (const member of members) {
      await sendOnboardingEmail(member.email, { name: member.name, rank: member.rank, matricola: member.matricola, day })
        .catch(e => console.error(`[onboarding] day${day} failed for ${member.email}:`, e.message))
      await sleep(100)
    }

    if (members.length > 0) {
      console.log(`[cron] onboarding day${day}: ${members.length} email inviate`)
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
