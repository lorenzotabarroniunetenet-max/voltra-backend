import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import propRoutes from './routes/prop.js'
import adminRoutes from './routes/admin.js'
import purchaseRoutes from './routes/purchase.js'
import contactRoutes from './routes/contact.js'

const app = express()
app.set('trust proxy', 1)

const origins = (process.env.ALLOWED_ORIGINS || 'https://voltrasolutions.com,https://www.voltrasolutions.com,http://localhost:5173').split(',')
app.use(cors({ origin: origins, credentials: true }))
app.use(express.json({ limit: '2mb' }))

app.get('/', (req, res) => res.json({ ok: true, service: 'voltra-backend', version: '3.2.0' }))
app.get('/health', (req, res) => res.json({ ok: true }))

app.use('/api/auth', authRoutes)
app.use('/api/prop', propRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/purchase', purchaseRoutes)
app.use('/api/contact', contactRoutes)

app.use((err, req, res, next) => {
  console.error('[error]', err)
  res.status(500).json({ error: 'Internal server error' })
})

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`Voltra v3.2 backend on :${port}`))
