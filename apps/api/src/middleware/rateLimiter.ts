import rateLimit from 'express-rate-limit'

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos antes de intentarlo de nuevo.' },
  skip: () => process.env.NODE_ENV === 'test',
})

export const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados escaneos por minuto.' },
  skip: () => process.env.NODE_ENV === 'test',
})

export const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes por minuto.' },
  skip: () => process.env.NODE_ENV === 'test',
})
