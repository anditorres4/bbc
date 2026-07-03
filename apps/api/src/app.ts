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
import { reportesRouter } from './reportes/reportes.router'
import { auditoriaRouter } from './auditoria/auditoria.router'
import { productosRouter } from './productos/productos.router'
import { authLimiter, scanLimiter, mutationLimiter } from './middleware/rateLimiter'

const app: Express = express()

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '')
}

function parseAllowedOrigins(value?: string): string[] {
  if (!value) return ['http://localhost:3000']

  return value
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean)
}

function isOriginAllowed(requestOrigin: string, allowedOrigins: string[]): boolean {
  const normalizedOrigin = normalizeOrigin(requestOrigin)

  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin.includes('*')) {
      const pattern = allowedOrigin
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
      return new RegExp(`^${pattern}$`).test(normalizedOrigin)
    }

    return normalizedOrigin === allowedOrigin
  })
}

const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN)

app.use(helmet())
app.use(
  cors({
    origin(origin, callback) {
      // Requests sin Origin (health checks, server-to-server, curl) no deben fallar.
      if (!origin) {
        callback(null, true)
        return
      }

      if (isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true)
        return
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
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

app.use('/auth', authLimiter, authRouter)
app.use('/api/barriles/scan', scanLimiter)
app.use('/api/barriles', mutationLimiter, barrilesRouter)
app.use('/api/rutas', mutationLimiter, rutasRouter)
app.use('/api/puntos', mutationLimiter, puntosRouter)
app.use('/api/usuarios', mutationLimiter, usuariosRouter)
app.use('/api/alertas', alertasRouter)
app.use('/api/reportes', reportesRouter)
app.use('/api/auditoria', auditoriaRouter)
app.use('/api/productos', mutationLimiter, productosRouter)

export { app }
