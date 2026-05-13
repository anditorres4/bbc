import 'dotenv/config'
import { app } from './app'
import { scheduleDailyAlerts } from './jobs/dailyAlerts'

const PORT = process.env.PORT ?? 3001

app.listen(PORT, () => {
  console.log(`[api] Running on http://localhost:${PORT}`)
  scheduleDailyAlerts()
})
