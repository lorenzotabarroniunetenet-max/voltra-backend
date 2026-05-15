import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const programs = [
  {
    name: 'Caporale',
    accountSize: 10000, phase: 'CHALLENGE',
    profitTargetPct: 8, maxDailyLossPct: 5, maxOverallLossPct: 10,
    minTradingDays: 4, profitSplitPct: 70, payoutFrequencyDays: 7,
    scalpingAllowed: true, newsAllowed: true, weekendHoldAllowed: false,
    priceUsd: 80,
  },
  {
    name: 'Sergente',
    accountSize: 25000, phase: 'CHALLENGE',
    profitTargetPct: 8, maxDailyLossPct: 5, maxOverallLossPct: 10,
    minTradingDays: 4, profitSplitPct: 75, payoutFrequencyDays: 7,
    scalpingAllowed: true, newsAllowed: true, weekendHoldAllowed: false,
    priceUsd: 160,
  },
  {
    name: 'Capitano',
    accountSize: 50000, phase: 'CHALLENGE',
    profitTargetPct: 8, maxDailyLossPct: 5, maxOverallLossPct: 10,
    minTradingDays: 4, profitSplitPct: 80, payoutFrequencyDays: 7,
    scalpingAllowed: true, newsAllowed: true, weekendHoldAllowed: false,
    priceUsd: null, // WIP
  },
  {
    name: 'Colonnello',
    accountSize: 100000, phase: 'CHALLENGE',
    profitTargetPct: 8, maxDailyLossPct: 5, maxOverallLossPct: 10,
    minTradingDays: 4, profitSplitPct: 85, payoutFrequencyDays: 7,
    scalpingAllowed: true, newsAllowed: true, weekendHoldAllowed: false,
    priceUsd: null, // WIP
  },
]

const defaultSettings = [
  { key: 'SUPPORT_EMAIL', value: 'support@voltrasolutions.com', isPublic: true },
  { key: 'EMAIL_FROM', value: 'Voltra <noreply@voltrasolutions.com>', isPublic: false },
  { key: 'TELEGRAM_SUPPORT_URL', value: '', isPublic: true },
  { key: 'TELEGRAM_SUPPORT_HANDLE', value: '', isPublic: true },
  { key: 'TELEGRAM_ADMIN_CHAT_ID', value: '', isPublic: false },
  { key: 'PAYMENT_ADDRESS', value: '', isPublic: false },
  { key: 'PAYMENT_NETWORK', value: 'USDT TRC20', isPublic: false },
]

async function main() {
  // Admin user
  const adminEmail = 'admin@voltrasolutions.com'
  const adminPass = 'voltra2025'
  const passwordHash = await bcrypt.hash(adminPass, 10)
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', emailVerified: true, approved: true },
    create: { email: adminEmail, passwordHash, name: 'Voltra Admin', role: 'ADMIN', emailVerified: true, approved: true },
  })
  console.log(`Admin ready: ${adminEmail} / ${adminPass}`)

  // Settings
  for (const s of defaultSettings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s })
  }
  console.log(`Settings seeded: ${defaultSettings.length}`)

  // Programs
  for (const p of programs) {
    const existing = await prisma.program.findFirst({ where: { name: p.name } })
    if (existing) {
      await prisma.program.update({ where: { id: existing.id }, data: p })
    } else {
      await prisma.program.create({ data: p })
    }
  }
  console.log(`Programs seeded: ${programs.length}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
