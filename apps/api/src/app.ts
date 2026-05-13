import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import { authRouter } from './auth/auth.router'
import { barrilesRouter } from './barriles/barriles.router'
import { rutasRouter } from './rutas/rutas.router'
import { puntosRouter } from './puntos/puntos.router'
import { usuariosRouter } from './usuarios/usuarios.router'
import { alertasRouter } from './alertas/alertas.router'

const app: Express = express()

app.use(helmet())
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  })
)
app.use(express.json())
app.use(cookieParser())

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'))
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bbc-api', timestamp: new Date().toISOString() })
})

app.use('/auth', authRouter)
app.use('/api/barriles', barrilesRouter)
app.use('/api/rutas', rutasRouter)
app.use('/api/puntos', puntosRouter)
app.use('/api/usuarios', usuariosRouter)
app.use('/api/alertas', alertasRouter)

export { app }
