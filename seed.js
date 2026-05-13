import 'dotenv/config'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const db = new Database(join(__dirname, 'voltra.db'))
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'follower', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS masters (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, country TEXT, style TEXT, bio TEXT, avatar TEXT, experience INTEGER, roi_12m REAL DEFAULT 0, drawdown REAL DEFAULT 0, win_rate REAL DEFAULT 0, sharpe REAL DEFAULT 0, profit_factor REAL DEFAULT 0, rating REAL DEFAULT 0, aum REAL DEFAULT 0, mt5_login TEXT, mt5_server TEXT, status TEXT DEFAULT 'active', fee_split REAL DEFAULT 70, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, label TEXT NOT NULL, mt5_login TEXT NOT NULL, mt5_server TEXT NOT NULL, mt5_password TEXT, broker TEXT, balance REAL DEFAULT 0, equity REAL DEFAULT 0, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS connections (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER UNIQUE NOT NULL, master_id INTEGER NOT NULL, lot_ratio REAL DEFAULT 1.0, max_drawdown REAL DEFAULT 10, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (master_id) REFERENCES masters(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, master_id INTEGER NOT NULL, account_id INTEGER, ticket TEXT, symbol TEXT NOT NULL, side TEXT NOT NULL, lots REAL NOT NULL, open_price REAL, close_price REAL, pnl REAL DEFAULT 0, open_time DATETIME, close_time DATETIME, status TEXT DEFAULT 'closed', FOREIGN KEY (master_id) REFERENCES masters(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS equity_history (id INTEGER PRIMARY KEY AUTOINCREMENT, master_id INTEGER NOT NULL, date DATE NOT NULL, equity REAL NOT NULL, UNIQUE(master_id, date), FOREIGN KEY (master_id) REFERENCES masters(id) ON DELETE CASCADE);
`)

console.log('Seeding...')
db.exec('DELETE FROM trades; DELETE FROM equity_history; DELETE FROM connections; DELETE FROM accounts; DELETE FROM masters; DELETE FROM users;')

db.prepare('INSERT INTO users(email,password_hash,name,role) VALUES(?,?,?,?)').run('admin@voltrasolutions.com', bcrypt.hashSync('admin1234', 10), 'Admin', 'admin')
const u = db.prepare('INSERT INTO users(email,password_hash,name,role) VALUES(?,?,?,?)').run('demo@voltrasolutions.com', bcrypt.hashSync('demo1234', 10), 'Demo User', 'follower')

const masters = [
  { name: 'Marcus Hale', country: 'UK', style: 'EUR/USD Scalper', exp: 8, roi: 143.7, dd: 6.2, win: 72.4, sharpe: 2.81, pf: 2.1, rating: 4.8, aum: 2400000 },
  { name: 'Yuki Tanaka', country: 'JP', style: 'Asian session breakout', exp: 12, roi: 87.3, dd: 9.5, win: 65.2, sharpe: 2.1, pf: 1.85, rating: 4.6, aum: 1800000 },
  { name: 'Dimitri Volkov', country: 'RU', style: 'HF arbitrage', exp: 10, roi: 198.2, dd: 12.4, win: 76.8, sharpe: 3.1, pf: 2.4, rating: 4.9, aum: 4200000 },
  { name: 'Aisha Khan', country: 'AE', style: 'Gold & oil swing', exp: 7, roi: 95.1, dd: 11.2, win: 61.3, sharpe: 2.05, pf: 1.95, rating: 4.5, aum: 1500000 },
  { name: 'Sofia Romano', country: 'IT', style: 'Trend following majors', exp: 6, roi: 62.4, dd: 7.8, win: 58.9, sharpe: 1.92, pf: 1.7, rating: 4.4, aum: 950000 }
]

masters.forEach(m => {
  const initials = m.name.split(' ').map(s => s[0]).join('')
  const info = db.prepare(`INSERT INTO masters(name,country,style,bio,avatar,experience,roi_12m,drawdown,win_rate,sharpe,profit_factor,rating,aum,mt5_login,mt5_server,fee_split) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(m.name, m.country, m.style, `${m.exp}-year track record in ${m.style.toLowerCase()}. Verified MT5.`, initials, m.exp, m.roi, m.dd, m.win, m.sharpe, m.pf, m.rating, m.aum, '0', 'Voltra-Live-01', 70)
  const mid = info.lastInsertRowid

  let val = 10000
  const daily = Math.pow(1 + m.roi / 100, 1/365) - 1
  for (let i = 364; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    val *= (1 + daily + (Math.random() - 0.5) * m.dd * 0.002)
    db.prepare('INSERT INTO equity_history(master_id,date,equity) VALUES(?,?,?)').run(mid, d.toISOString().split('T')[0], Math.round(val * 100) / 100)
  }

  const symbols = ['EURUSD','GBPUSD','USDJPY','XAUUSD','USDCHF','AUDUSD','USOIL','BTCUSD']
  for (let i = 0; i < 50; i++) {
    const op = Math.round((0.5 + Math.random() * 2000) * 100) / 100
    const t0 = Date.now() - Math.floor(Math.random() * 30 * 86400000)
    db.prepare(`INSERT INTO trades(master_id,ticket,symbol,side,lots,open_price,close_price,pnl,open_time,close_time,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      mid, `T${100000+i}`, symbols[Math.floor(Math.random()*symbols.length)],
      Math.random() < 0.52 ? 'BUY' : 'SELL',
      Math.round((0.05 + Math.random() * 2.5) * 100) / 100,
      op, Math.round(op * (1 + (Math.random()-0.5)*0.01) * 100) / 100,
      Math.round((-180 + Math.random() * 600) * 100) / 100,
      new Date(t0).toISOString(), new Date(t0 + Math.random() * 6 * 3600000).toISOString(), 'closed')
  }
})

db.prepare('INSERT INTO accounts(user_id,label,mt5_login,mt5_server,broker,balance,equity) VALUES(?,?,?,?,?,?,?)').run(u.lastInsertRowid, 'My MT5 Account', '12345678', 'IC-Markets-Live01', 'IC Markets', 10000, 10245.32)

console.log('Done.')
console.log('Admin: admin@voltrasolutions.com / admin1234')
console.log('Demo:  demo@voltrasolutions.com / demo1234')
