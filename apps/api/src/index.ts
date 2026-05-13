import 'dotenv/config'
import { app } from './app'
import { scheduleDailyAlerts } from './jobs/dailyAlerts'

const PORT = process.env.PORT ?? 3001

process.on('uncaughtException', (error) => {
  console.error('[api] Uncaught exception', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[api] Unhandled rejection', reason)
})

console.log('[api] Booting service', {
  nodeEnv: process.env.NODE_ENV,
  port: PORT,
  hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  corsOrigin: process.env.CORS_ORIGIN ?? null,
})

app.listen(PORT, () => {
  console.log(`[api] Running on http://localhost:${PORT}`)
  scheduleDailyAlerts()
})
