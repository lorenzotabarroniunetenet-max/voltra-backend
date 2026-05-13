import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 4000
const SECRET = process.env.JWT_SECRET || 'voltra-dev-secret'
const BRIDGE_KEY = process.env.BRIDGE_API_KEY || 'voltra-bridge-dev'

const db = new Database(join(__dirname, 'voltra.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'follower', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS masters (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, country TEXT, style TEXT,
    bio TEXT, avatar TEXT, experience INTEGER, roi_12m REAL DEFAULT 0, drawdown REAL DEFAULT 0,
    win_rate REAL DEFAULT 0, sharpe REAL DEFAULT 0, profit_factor REAL DEFAULT 0,
    rating REAL DEFAULT 0, aum REAL DEFAULT 0, mt5_login TEXT, mt5_server TEXT,
    status TEXT DEFAULT 'active', fee_split REAL DEFAULT 70, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, label TEXT NOT NULL,
    mt5_login TEXT NOT NULL, mt5_server TEXT NOT NULL, mt5_password TEXT, broker TEXT,
    balance REAL DEFAULT 0, equity REAL DEFAULT 0, status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER UNIQUE NOT NULL, master_id INTEGER NOT NULL,
    lot_ratio REAL DEFAULT 1.0, max_drawdown REAL DEFAULT 10, status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (master_id) REFERENCES masters(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT, master_id INTEGER NOT NULL, account_id INTEGER,
    ticket TEXT, symbol TEXT NOT NULL, side TEXT NOT NULL, lots REAL NOT NULL,
    open_price REAL, close_price REAL, pnl REAL DEFAULT 0,
    open_time DATETIME, close_time DATETIME, status TEXT DEFAULT 'closed',
    FOREIGN KEY (master_id) REFERENCES masters(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS equity_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, master_id INTEGER NOT NULL, date DATE NOT NULL,
    equity REAL NOT NULL, UNIQUE(master_id, date),
    FOREIGN KEY (master_id) REFERENCES masters(id) ON DELETE CASCADE
  );
`)

const signToken = (u) => jwt.sign({ id: u.id, email: u.email, role: u.role }, SECRET, { expiresIn: '7d' })

const authRequired = (req, res, next) => {
  const h = req.headers.authorization
  if (!h) return res.status(401).json({ error: 'No token' })
  try { req.user = jwt.verify(h.replace('Bearer ', ''), SECRET); next() }
  catch { res.status(401).json({ error: 'Invalid token' }) }
}

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  next()
}

const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }))
app.use(express.json({ limit: '1mb' }))
app.get('/health', (req, res) => res.json({ ok: true }))

// AUTH
app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body
  if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' })
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'Email exists' })
  const hash = bcrypt.hashSync(password, 10)
  const info = db.prepare('INSERT INTO users(email,password_hash,name) VALUES(?,?,?)').run(email, hash, name)
  const user = db.prepare('SELECT id,email,name,role FROM users WHERE id=?').get(info.lastInsertRowid)
  res.json({ token: signToken(user), user })
})

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body
  const row = db.prepare('SELECT * FROM users WHERE email=?').get(email)
  if (!row || !bcrypt.compareSync(password, row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' })
  const user = { id: row.id, email: row.email, name: row.name, role: row.role }
  res.json({ token: signToken(user), user })
})

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json(db.prepare('SELECT id,email,name,role,created_at FROM users WHERE id=?').get(req.user.id))
})

// MASTERS
app.get('/api/masters', (req, res) => {
  const { sortBy = 'roi_12m', minRoi, maxDd, minRating } = req.query
  let sql = "SELECT * FROM masters WHERE status='active'"
  const p = []
  if (minRoi) { sql += ' AND roi_12m >= ?'; p.push(+minRoi) }
  if (maxDd) { sql += ' AND drawdown <= ?'; p.push(+maxDd) }
  if (minRating) { sql += ' AND rating >= ?'; p.push(+minRating) }
  const order = ['roi_12m','sharpe','win_rate','rating','aum'].includes(sortBy) ? sortBy : 'roi_12m'
  sql += ` ORDER BY ${order} DESC`
  const rows = db.prepare(sql).all(...p).map(m => ({
    ...m,
    followers: db.prepare("SELECT COUNT(*) as c FROM connections WHERE master_id=? AND status='active'").get(m.id).c
  }))
  res.json(rows)
})

app.get('/api/masters/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM masters WHERE id=?').get(req.params.id)
  if (!m) return res.status(404).json({ error: 'Not found' })
  m.equityCurve = db.prepare('SELECT date,equity FROM equity_history WHERE master_id=? ORDER BY date').all(req.params.id)
  m.trades = db.prepare('SELECT * FROM trades WHERE master_id=? ORDER BY close_time DESC LIMIT 50').all(req.params.id)
  m.followers = db.prepare("SELECT COUNT(*) as c FROM connections WHERE master_id=? AND status='active'").get(m.id).c
  res.json(m)
})

app.post('/api/masters', authRequired, adminOnly, (req, res) => {
  const f = req.body
  const info = db.prepare(`INSERT INTO masters(name,country,style,bio,avatar,experience,roi_12m,drawdown,win_rate,sharpe,profit_factor,rating,aum,mt5_login,mt5_server,fee_split)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    f.name, f.country||'', f.style||'', f.bio||'', f.avatar||'', f.experience||0,
    f.roi_12m||0, f.drawdown||0, f.win_rate||0, f.sharpe||0, f.profit_factor||0,
    f.rating||0, f.aum||0, f.mt5_login||'', f.mt5_server||'', f.fee_split||70)
  res.json(db.prepare('SELECT * FROM masters WHERE id=?').get(info.lastInsertRowid))
})

app.put('/api/masters/:id', authRequired, adminOnly, (req, res) => {
  const fields = ['name','country','style','bio','avatar','experience','roi_12m','drawdown','win_rate','sharpe','profit_factor','rating','aum','mt5_login','mt5_server','status','fee_split']
  const upd = fields.filter(k => req.body[k] !== undefined)
  if (!upd.length) return res.status(400).json({ error: 'No fields' })
  db.prepare(`UPDATE masters SET ${upd.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...upd.map(k => req.body[k]), req.params.id)
  res.json(db.prepare('SELECT * FROM masters WHERE id=?').get(req.params.id))
})

app.delete('/api/masters/:id', authRequired, adminOnly, (req, res) => {
  db.prepare('DELETE FROM masters WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ACCOUNTS
app.get('/api/accounts', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM accounts WHERE user_id=?').all(req.user.id).map(a => {
    const conn = db.prepare('SELECT c.*, m.name as master_name FROM connections c JOIN masters m ON c.master_id=m.id WHERE c.account_id=?').get(a.id)
    return { ...a, pnl: a.equity - a.balance, pnlPct: a.balance ? ((a.equity - a.balance) / a.balance) * 100 : 0, connection: conn || null }
  })
  res.json(rows)
})

app.post('/api/accounts', authRequired, (req, res) => {
  const { label, mt5_login, mt5_server, mt5_password, broker, balance } = req.body
  if (!label || !mt5_login || !mt5_server) return res.status(400).json({ error: 'Missing fields' })
  const info = db.prepare('INSERT INTO accounts(user_id,label,mt5_login,mt5_server,mt5_password,broker,balance,equity) VALUES(?,?,?,?,?,?,?,?)').run(
    req.user.id, label, mt5_login, mt5_server, mt5_password||'', broker||'', balance||0, balance||0)
  res.json(db.prepare('SELECT * FROM accounts WHERE id=?').get(info.lastInsertRowid))
})

app.delete('/api/accounts/:id', authRequired, (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id=? AND user_id=?').run(req.params.id, req.user.id)
  res.json({ ok: true })
})

// COPY
app.post('/api/copy/connect', authRequired, (req, res) => {
  const { accountId, masterId, lotRatio = 1.0, maxDrawdown = 10 } = req.body
  const acc = db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(accountId, req.user.id)
  if (!acc) return res.status(404).json({ error: 'Account not found' })
  const m = db.prepare("SELECT * FROM masters WHERE id=? AND status='active'").get(masterId)
  if (!m) return res.status(404).json({ error: 'Master not found' })
  db.prepare('DELETE FROM connections WHERE account_id=?').run(accountId)
  db.prepare('INSERT INTO connections(account_id,master_id,lot_ratio,max_drawdown) VALUES(?,?,?,?)').run(accountId, masterId, lotRatio, maxDrawdown)
  res.json({ ok: true })
})

app.post('/api/copy/disconnect', authRequired, (req, res) => {
  const acc = db.prepare('SELECT * FROM accounts WHERE id=? AND user_id=?').get(req.body.accountId, req.user.id)
  if (!acc) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM connections WHERE account_id=?').run(req.body.accountId)
  res.json({ ok: true })
})

// TRADES & PORTFOLIO
app.get('/api/trades/master/:id', (req, res) => {
  res.json(db.prepare('SELECT * FROM trades WHERE master_id=? ORDER BY close_time DESC LIMIT 50').all(req.params.id))
})

app.post('/api/trades/ingest', (req, res) => {
  if (req.body.apiKey !== BRIDGE_KEY) return res.status(401).json({ error: 'Unauthorized' })
  const t = req.body
  const info = db.prepare(`INSERT INTO trades(master_id,ticket,symbol,side,lots,open_price,close_price,pnl,open_time,close_time,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(t.masterId, t.ticket, t.symbol, t.side, t.lots, t.openPrice, t.closePrice, t.pnl, t.openTime, t.closeTime, t.status||'closed')
  res.json({ id: info.lastInsertRowid })
})

app.get('/api/portfolio', authRequired, (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id=?').all(req.user.id)
  const tb = accounts.reduce((s,a)=>s+(a.balance||0),0)
  const te = accounts.reduce((s,a)=>s+(a.equity||0),0)
  const allocation = db.prepare(`SELECT m.name, a.equity as value, a.id as account_id
    FROM accounts a JOIN connections c ON c.account_id=a.id JOIN masters m ON c.master_id=m.id
    WHERE a.user_id=?`).all(req.user.id)
  res.json({
    summary: { totalBalance:tb, totalEquity:te, totalPnl:te-tb, totalPnlPct:tb?((te-tb)/tb)*100:0,
      activeStrategies: allocation.length, accountsCount: accounts.length },
    allocation, accounts
  })
})

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }) })
app.listen(PORT, () => console.log(`Voltra backend on :${PORT}`))
