// Unpin briefings di tipo ricorrenza più vecchi di 24h
// node src/cron/unpin-old.js

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const result = await prisma.briefing.updateMany({
    where: { type: 'ricorrenza', pinned: true, publishedAt: { lt: cutoff } },
    data: { pinned: false },
  })
  console.log(`[cron-unpin] sbloccati ${result.count} briefing ricorrenza`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
