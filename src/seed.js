import 'dotenv/config'
import bcrypt from 'bcrypt'
import { prisma } from './lib/prisma.js'
const MASTERS = [
  { name:'Marcus Hale', country:'UK', style:'Scalping EUR/USD', mt5Login:'8001001', mt5Server:'Broker-Live-01', experience:8, roi12m:143.7, drawdown:6.2, winRate:72.4, sharpe:2.81, profitFactor:2.1, rating:4.8 },
  { name:'Yuki Tanaka', country:'JP', style:'Asian session breakout', mt5Login:'8001002', mt5Server:'Broker-Live-02', experience:12, roi12m:98.4, drawdown:8.1, winRate:68.2, sharpe:2.3, profitFactor:1.9, rating:4.6 },
  { name:'Sofia Romano', country:'IT', style:'Trend following majors', mt5Login:'8001003', mt5Server:'Broker-Live-01', experience:6, roi12m:67.2, drawdown:9.5, winRate:61.3, sharpe:1.8, profitFactor:1.7, rating:4.3 },
  { name:'Dimitri Volkov', country:'RU', style:'High-frequency arbitrage', mt5Login:'8001004', mt5Server:'Broker-Live-03', experience:10, roi12m:187.5, drawdown:11.2, winRate:75.8, sharpe:3.1, profitFactor:2.4, rating:4.9 },
  { name:'Aisha Khan', country:'AE', style:'Gold & oil swing', mt5Login:'8001005', mt5Server:'Broker-Live-02', experience:7, roi12m:82.1, drawdown:7.8, winRate:64.5, sharpe:2.0, profitFactor:1.85, rating:4.5 }
]
async function main() {
  const h = await bcrypt.hash('changeme123', 10)
  await prisma.user.upsert({ where: { email:'admin@voltrasolutions.com' }, update:{}, create:{ email:'admin@voltrasolutions.com', name:'Voltra Admin', passwordHash:h, role:'ADMIN' } })
  for (const m of MASTERS) await prisma.master.upsert({ where: { mt5Login:m.mt5Login }, update:m, create:m })
  console.log('[seed] done')
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect())
