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
import telegramRoutes from './routes/telegram.js'

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
app.use('/api/telegram', telegramRoutes)
app.use('/api/subscriptions', (await import('./routes/subscriptions.js')).default)

app.use((err, req, res, next) => {
  console.error('[error]', err)
  res.status(500).json({ error: 'Internal server error' })
})

const port = process.env.PORT || 4000
app.listen(port, () => {
  console.log(`Voltra backend on :${port}`)
  // Avvia bot in long polling (non-blocking)
  // Avvia bot in long polling con retry su 409 (Render rolling deploy)
  import('./bot/index.js').then(({ bot }) => {
    if (!bot) return
    const startBot = async (attempt = 1) => {
      try {
        await bot.start({
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: false,
          onStart: (info) => console.log(`[bot] @${info.username} polling`),
        })
      } catch (e) {
        if (e.error_code === 409) {
          const wait = attempt * 5000
          console.log(`[bot] 409 conflict, retry in ${wait/1000}s (attempt ${attempt})`)
          setTimeout(() => startBot(attempt + 1), wait)
        } else {
          console.error('[bot] start error:', e.message)
        }
      }
    }
    startBot()
    // Avvia cron notifiche
    import('./cron/notifications.js').then(({ startNotificationCrons }) => {
      startNotificationCrons(bot)
    }).catch(e => console.error('[cron] start error:', e.message))
    import('./cron/subscriptions.js').then(({ startSubscriptionCron }) => {
      startSubscriptionCron(bot)
    }).catch(e => console.error('[cron] subscriptions error:', e.message))
  }).catch(e => console.error('[bot] import error:', e.message))
})
