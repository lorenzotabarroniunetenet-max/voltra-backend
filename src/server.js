import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import propRoutes from './routes/prop.js'
import adminRoutes from './routes/admin.js'
import purchaseRoutes from './routes/purchase.js'
import contactRoutes from './routes/contact.js'
import membriRoutes from './routes/membri.js'
import aiRoutes from './routes/ai.js'

const app = express()
app.set('trust proxy', 1)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '2mb' }))

app.get('/', (req, res) => res.json({ ok: true, service: 'voltra-backend', version: '3.9.0' }))
app.get('/health', (req, res) => res.json({ ok: true }))

app.get('/api/public/features', async (req, res) => {
  try {
    const { getSetting } = await import('./lib/settings.js')
    const gunshotDisabled = (await getSetting('GUNSHOT_DISABLED', 'false')) === 'true'
    res.json({ gunshotDisabled })
  } catch (e) { res.json({ gunshotDisabled: false }) }
})

app.use('/api/auth', authRoutes)
app.use('/api/prop', propRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/purchase', purchaseRoutes)
app.use('/api/contact', contactRoutes)
app.use('/api/membri', membriRoutes)
app.use('/api/ai', aiRoutes)

app.use((err, req, res, next) => {
  console.error('[error]', err)
  res.status(500).json({ error: 'Internal server error' })
})

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`Voltra v3.9 backend on :${port}`))
