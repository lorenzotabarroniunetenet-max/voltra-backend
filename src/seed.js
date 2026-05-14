import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  // Admin user
  const passwordHash = await bcrypt.hash('voltra2025', 10)
  await prisma.user.upsert({
    where: { email: 'admin@voltrasolutions.com' },
    update: {},
    create: {
      email: 'admin@voltrasolutions.com',
      passwordHash,
      name: 'Admin Voltra',
      role: 'ADMIN',
      emailVerified: true,
    }
  })

  // Programs
  const programs = [
    {
      name: 'Trader Challenge 25K',
      accountSize: 25000,
      phase: 'CHALLENGE',
      profitTargetPct: 10,
      maxDailyLossPct: 3,
      maxOverallLossPct: 6,
      minTradingDays: 4,
      profitSplitPct: 70,
      priceUsd: 160,
      activationFeeUsd: 340,
    },
    {
      name: 'Trader Challenge 50K',
      accountSize: 50000,
      phase: 'CHALLENGE',
      profitTargetPct: 10,
      maxDailyLossPct: 3,
      maxOverallLossPct: 6,
      minTradingDays: 4,
      profitSplitPct: 70,
      priceUsd: 320,
      activationFeeUsd: 680,
    },
    {
      name: 'Trader Challenge 100K',
      accountSize: 100000,
      phase: 'CHALLENGE',
      profitTargetPct: 10,
      maxDailyLossPct: 3,
      maxOverallLossPct: 6,
      minTradingDays: 4,
      profitSplitPct: 70,
      priceUsd: 640,
      activationFeeUsd: 1360,
    },
    {
      name: 'Instant Funding 25K',
      accountSize: 25000,
      phase: 'INSTANT',
      profitTargetPct: null,
      maxDailyLossPct: 3,
      maxOverallLossPct: 6,
      minTradingDays: null,
      profitSplitPct: 70,
      priceUsd: 999,
    },
    {
      name: 'Instant Funding 50K',
      accountSize: 50000,
      phase: 'INSTANT',
      profitTargetPct: null,
      maxDailyLossPct: 3,
      maxOverallLossPct: 6,
      minTradingDays: null,
      profitSplitPct: 70,
      priceUsd: 1999,
    },
    {
      name: 'Instant Funding 100K',
      accountSize: 100000,
      phase: 'INSTANT',
      profitTargetPct: null,
      maxDailyLossPct: 3,
      maxOverallLossPct: 6,
      minTradingDays: null,
      profitSplitPct: 70,
      priceUsd: 3999,
    },
  ]

  for (const p of programs) {
    await prisma.program.upsert({
      where: { id: p.name },
      update: {},
      create: p,
    }).catch(async () => {
      const existing = await prisma.program.findFirst({ where: { name: p.name } })
      if (!existing) await prisma.program.create({ data: p })
    })
  }

  console.log('Seed completato')
}

main().catch(console.error).finally(() => prisma.$disconnect())
