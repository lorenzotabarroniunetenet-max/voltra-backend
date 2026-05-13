import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth.js'
import mastersRoutes from './routes/masters.js'
import mt5Routes from './routes/mt5.js'
import copyRoutes from './routes/copy.js'
import tradesRoutes from './routes/trades.js'
import adminRoutes from './routes/admin.js'

const app = express()
const allowed = (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)
app.use(cors({ origin: (o,cb) => (!o||!allowed.length||allowed.includes(o)) ? cb(null,true) : cb(new Error('CORS')), credentials: true }))
app.use(express.json({ limit:'1mb' }))
app.use('/api/', rateLimit({ windowMs:60_000, max:120 }))
app.use('/api/auth/', rateLimit({ windowMs:60_000, max:10 }))
app.get('/', (req,res) => res.json({ name:'voltra-api', status:'ok' }))
app.get('/health', (req,res) => res.json({ ok:true }))
app.use('/api/auth', authRoutes)
app.use('/api/masters', mastersRoutes)
app.use('/api/mt5', mt5Routes)
app.use('/api/copy', copyRoutes)
app.use('/api/trades', tradesRoutes)
app.use('/api/admin', adminRoutes)
app.use((req,res) => res.status(404).json({ error:'Not found' }))
app.use((err,req,res,next) => res.status(500).json({ error:'Internal error' }))
const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`[voltra-api] :${PORT}`))
