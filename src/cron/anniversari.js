// Cron giornaliero: invia notifica anniversario arruolamento
// node src/cron/anniversari.js

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('[cron-anniversari] scansione anniversari...')
  const today = new Date()
  const todayKey = `${today.getMonth() + 1}-${today.getDate()}`

  const users = await prisma.user.findMany({
    where: { role: 'TRADER', approved: true, enlistedAt: { not: null } },
  })

  let notified = 0
  for (const u of users) {
    if (!u.enlistedAt) continue
    const enlist = new Date(u.enlistedAt)
    const enlistKey = `${enlist.getMonth() + 1}-${enlist.getDate()}`
    if (enlistKey !== todayKey) continue

    const yearsOfService = today.getFullYear() - enlist.getFullYear()
    if (yearsOfService < 1) continue

    try {
      await prisma.serviceLogEntry.create({
        data: {
          userId: u.id,
          type: 'anniversary',
          title: `${yearsOfService}° anniversario di servizio`,
          body: `Il ${enlist.toLocaleDateString('it-IT', { dateStyle: 'long' })} è entrato nell'organico Voltra. ${yearsOfService} ${yearsOfService === 1 ? 'anno' : 'anni'} di servizio compiuti.`,
          iconKey: '🎂',
        },
      })

      await prisma.notification.create({
        data: {
          userId: u.id,
          type: 'anniversary',
          title: `${yearsOfService}° anniversario`,
          body: 'Il Comando rinnova il proprio riconoscimento.',
          url: '/fascicolo',
        },
      })

      // Briefing personale pinned per 24h (sarà unpinned dal cron del giorno dopo)
      await prisma.briefing.create({
        data: {
          type: 'ricorrenza',
          title: `Anniversario di servizio — ${u.matricola || 'membro'}`,
          body: `Il Comando registra il ${yearsOfService}° anniversario di servizio del membro ${u.matricola || u.name}. Si rinnova il riconoscimento al rispetto delle consegne.\n\nSilentio agimus.`,
          pinned: true,
        },
      })

      notified++
      console.log(`[cron-anniversari] ${u.email} - ${yearsOfService}° anniversario`)
    } catch (e) {
      console.error(`[cron-anniversari] errore ${u.email}:`, e.message)
    }
  }
  console.log(`[cron-anniversari] completato. ${notified} anniversari notificati.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
