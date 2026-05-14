import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'

import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import propRoutes from './routes/prop.js'
import purchaseRoutes from './routes/purchase.js'

const app = express()

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://voltrasolutions.com,http://localhost:5173').split(',')

app.set('trust proxy', 1)
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error('CORS: origin not allowed'))
  },
  credentials: true,
}))

app.use(express.json({ limit: '2mb' }))
app.use('/api/', rateLimit({ windowMs: 60_000, max: 200 }))
app.use('/api/auth/', rateLimit({ windowMs: 60_000, max: 20 }))

app.get('/', (req, res) => res.json({ name: 'voltra-prop-api', version: '3.0.0', status: 'ok' }))

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/prop', propRoutes)
app.use('/api/purchase', purchaseRoutes)

app.use((err, req, res, next) => {
  console.error('[error]', err.message)
  res.status(500).json({ error: 'Internal error' })
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`[voltra-prop-api v3.0] listening on :${PORT}`)
})
