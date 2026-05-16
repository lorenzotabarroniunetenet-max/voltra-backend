// Rapporto Settimanale - cron lunedì 06:00 UTC
// Pubblica un OdG di riepilogo settimanale automatico
// node src/cron/rapporto-settimanale.js

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('[cron-rapporto] generazione Rapporto Settimanale...')

  const since = new Date(Date.now() - 7 * 86400000)

  const newMembers = await prisma.user.count({
    where: { approved: true, role: 'TRADER', approvedAt: { gte: since } },
  })
  const promotions = await prisma.serviceLogEntry.count({
    where: { type: 'promotion', occurredAt: { gte: since } },
  })
  const decorations = await prisma.decorationAward.count({
    where: { awardedAt: { gte: since } },
  })
  const totalActive = await prisma.user.count({
    where: { approved: true, role: 'TRADER' },
  })

  const weekNum = Math.ceil(((Date.now() - new Date(new Date().getFullYear(), 0, 1)) / 86400000) / 7)

  const body = `Sintesi settimanale dell'organico Voltra.

Settimana ${weekNum} — Bollettino del Comando.

Organico attivo: ${totalActive} membri in servizio.
Nuovi arruolamenti registrati: ${newMembers}.
Promozioni di grado disposte: ${promotions}.
Onorificenze conferite: ${decorations}.

Il Comando rinnova la consegna del silenzio operativo.

Restare in posizione.

Silentio agimus.`

  const briefing = await prisma.briefing.create({
    data: {
      type: 'comunicazione',
      title: `Rapporto del Comandante — Settimana ${weekNum}`,
      body,
      pinned: false,
    },
  })

  // Notifica tutti
  const users = await prisma.user.findMany({
    where: { role: 'TRADER', approved: true },
    select: { id: true },
  })
  if (users.length > 0) {
    await prisma.notification.createMany({
      data: users.map(u => ({
        userId: u.id,
        type: 'briefing',
        title: 'Rapporto Settimanale del Comandante',
        body: briefing.title,
        url: '/briefing',
      })),
    })
  }

  console.log(`[cron-rapporto] pubblicato briefing #${briefing.number} - ${users.length} notifiche inviate`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
