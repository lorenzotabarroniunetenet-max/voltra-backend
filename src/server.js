import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import authRoutes from './routes/auth.js'
import accountsRoutes from './routes/accounts.js'
import rulesRoutes from './routes/rules.js'
import tradesRoutes from './routes/trades.js'
import adminRoutes from './routes/admin.js'
import { bootCopyEngine } from './services/copyEngine.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(express.static(join(__dirname, '../public')))

const allowed = (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)
app.use(cors({
  origin: (o, cb) => (!o || !allowed.length || allowed.includes(o)) ? cb(null, true) : cb(null, false),
  credentials: true
}))

app.use(express.json({ limit: '1mb' }))
app.use('/api/', rateLimit({ windowMs: 60_000, max: 200 }))
app.use('/api/auth/', rateLimit({ windowMs: 60_000, max: 20 }))

app.get('/', (req, res) => res.json({ name: 'voltra-api', version: '2.1.0', status: 'ok', copyEngine: !!process.env.METAAPI_TOKEN }))
app.get('/health', (req, res) => res.json({ ok: true }))

app.use('/api/auth', authRoutes)
app.use('/api/accounts', accountsRoutes)
app.use('/api/rules', rulesRoutes)
app.use('/api/trades', tradesRoutes)
app.use('/api/admin', adminRoutes)

app.use('/api/*', (req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message || 'Internal error' }) })

const PORT = process.env.PORT || 4000
app.listen(PORT, async () => {
  console.log(`[voltra-api v2.1] listening on :${PORT}`)
  bootCopyEngine().catch(e => console.error('[boot] copy engine failed:', e.message))
})
