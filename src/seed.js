import 'dotenv/config'
import bcrypt from 'bcrypt'
import { prisma } from './lib/prisma.js'

async function main() {
  const h = await bcrypt.hash('voltra2025', 10)
  await prisma.user.upsert({
    where: { email: 'admin@voltrasolutions.com' },
    update: { role: 'ADMIN', passwordHash: h },
    create: { email: 'admin@voltrasolutions.com', name: 'Voltra Admin', passwordHash: h, role: 'ADMIN' }
  })
  console.log('[seed] admin: admin@voltrasolutions.com / voltra2025')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
