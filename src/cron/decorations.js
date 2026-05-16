// Cron worker per onorificenze automatiche (Stelle di Anzianità)
// Da invocare con: node src/cron/decorations.js
// Configurabile su Render come Cron Job: ogni giorno alle 06:00 UTC

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const MILESTONES = [
  { days: 100, slug: 'stella-anzianita-bronzo' },
  { days: 365, slug: 'stella-anzianita-argento' },
  { days: 1000, slug: 'stella-anzianita-oro' },
]

async function processUser(user) {
  const enlistedAt = user.enlistedAt || user.approvedAt
  if (!enlistedAt) return 0
  const days = Math.floor((Date.now() - new Date(enlistedAt).getTime()) / 86400000)
  let conferred = 0

  for (const milestone of MILESTONES) {
    if (days < milestone.days) continue
    const decoration = await prisma.decoration.findUnique({ where: { slug: milestone.slug } })
    if (!decoration) continue

    const existing = await prisma.decorationAward.findUnique({
      where: { decorationId_userId: { decorationId: decoration.id, userId: user.id } },
    }).catch(() => null)
    if (existing) continue

    try {
      await prisma.decorationAward.create({
        data: {
          decorationId: decoration.id,
          userId: user.id,
          reason: `Conferimento automatico al raggiungimento di ${milestone.days} giorni di servizio.`,
        },
      })

      await prisma.serviceLogEntry.create({
        data: {
          userId: user.id,
          type: 'decoration',
          title: `${milestone.days} giorni di servizio — ${decoration.name}`,
          body: decoration.criterion,
          iconKey: decoration.iconKey,
        },
      })

      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'decoration',
          title: 'Onorificenza conferita',
          body: `${decoration.name} — ${milestone.days} giorni di servizio.`,
          url: '/fascicolo',
        },
      })

      conferred++
      console.log(`[cron-decorations] ${decoration.name} conferita a ${user.email} (${days} gg)`)
    } catch (e) {
      console.error(`[cron-decorations] errore per ${user.email}:`, e.message)
    }
  }
  return conferred
}

async function main() {
  console.log('[cron-decorations] avvio scansione anniversari di servizio...')
  const users = await prisma.user.findMany({
    where: { role: 'TRADER', approved: true, enlistedAt: { not: null } },
  })
  let total = 0
  for (const u of users) total += await processUser(u)
  console.log(`[cron-decorations] completato. Onorificenze conferite: ${total}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
