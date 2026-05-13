/**
 * Tests de autenticación y autorización — BBC Barrel Track API
 *
 * Prisma se mockea completamente: los tests NO necesitan una base de datos real.
 * Los 6 escenarios requeridos están cubiertos:
 *   ✓ login correcto
 *   ✓ login fallido (credenciales incorrectas)
 *   ✓ token expirado
 *   ✓ refresh válido
 *   ✓ acceso sin token
 *   ✓ acceso con rol insuficiente
 */

// jest.mock se "hoistea" antes de los imports — el factory no puede referenciar
// variables del scope externo, por eso las funciones mock se crean dentro.
jest.mock('../db/client', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { Role } from '@prisma/client'

import { app } from '../app'
import { prisma } from '../db/client'
import { authenticate } from '../middleware/authenticate'
import { authorize } from '../middleware/authorize'

// ─── Helpers de tipado para los mocks ────────────────────────────────────────

const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserUpdate = prisma.user.update as jest.Mock
const mockRefreshCreate = prisma.refreshToken.create as jest.Mock
const mockRefreshFindUnique = prisma.refreshToken.findUnique as jest.Mock
const mockRefreshUpdateMany = prisma.refreshToken.updateMany as jest.Mock

// ─── Rutas de test para verificar autorización por rol ───────────────────────
// Se añaden al app ANTES de que supertest haga cualquier request.
app.get('/test/admin-only', authenticate, authorize(Role.ADMIN), (_req, res) => {
  res.json({ ok: true })
})
app.get(
  '/test/multi-role',
  authenticate,
  authorize(Role.ADMIN, Role.SUPERVISOR),
  (_req, res) => {
    res.json({ ok: true })
  }
)

// ─── Datos de prueba ──────────────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-secret-32-chars-minimum!!'
const MOCK_PASSWORD = 'BBC2026!'
// cost=1 para que los tests sean rápidos (bcrypt cost=12 tarda ~400ms)
const MOCK_HASH = bcrypt.hashSync(MOCK_PASSWORD, 1)

const mockUser = {
  id: 'user-test-001',
  email: 'admin@bbc.co',
  name: 'Admin BBC',
  role: Role.ADMIN,
  passwordHash: MOCK_HASH,
  phone: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockRtRecord = {
  id: 'rt-test-001',
  token: 'valid-refresh-token-hex-string-abc',
  userId: 'user-test-001',
  expiresAt: new Date(Date.now() + 7 * 86_400_000),
  revokedAt: null,
  createdAt: new Date(),
}

/** Genera un access token con el secret de test */
function makeToken(payload: { sub: string; role: string }, opts?: jwt.SignOptions) {
  return jwt.sign(payload, JWT_SECRET, opts)
}

/** Genera un access token ya expirado */
function makeExpiredToken(payload: { sub: string; role: string }) {
  // exp explícito en el pasado — más fiable que expiresIn negativo
  return jwt.sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 60 }, JWT_SECRET)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auth API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Defaults que se usan en múltiples tests
    mockRefreshCreate.mockResolvedValue(mockRtRecord)
    mockRefreshUpdateMany.mockResolvedValue({ count: 1 })
    mockUserUpdate.mockResolvedValue(mockUser)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /auth/login
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /auth/login', () => {
    it('[✓ login correcto] devuelve accessToken, refreshToken y user sin passwordHash', async () => {
      mockUserFindUnique.mockResolvedValue(mockUser)

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'admin@bbc.co', password: MOCK_PASSWORD })
        .expect(200)

      expect(res.body.accessToken).toBeTruthy()
      expect(res.body.refreshToken).toBeTruthy()
      expect(res.body.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        role: Role.ADMIN,
      })
      // Nunca debe exponerse el hash
      expect(res.body.user.passwordHash).toBeUndefined()

      // Cookie httpOnly debe estar presente para el cliente web
      const rawCookie = res.headers['set-cookie']
      const setCookie: string[] = Array.isArray(rawCookie)
        ? rawCookie
        : rawCookie
          ? [rawCookie]
          : []
      expect(setCookie.some((c) => c.startsWith('bbc_refresh='))).toBe(true)
      expect(setCookie.some((c) => c.includes('HttpOnly'))).toBe(true)
      expect(setCookie.some((c) => c.includes('SameSite=Lax'))).toBe(true)
    })

    it('[✓ login fallido] retorna 401 con contraseña incorrecta', async () => {
      mockUserFindUnique.mockResolvedValue(mockUser)

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'admin@bbc.co', password: 'wrong-password' })
        .expect(401)

      expect(res.body.error).toBe('Credenciales inválidas')
    })

    it('[✓ login fallido] retorna 401 cuando el email no existe', async () => {
      mockUserFindUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'noexiste@bbc.co', password: MOCK_PASSWORD })
        .expect(401)

      expect(res.body.error).toBe('Credenciales inválidas')
    })

    it('retorna 401 si el usuario está inactivo', async () => {
      mockUserFindUnique.mockResolvedValue({ ...mockUser, isActive: false })

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'admin@bbc.co', password: MOCK_PASSWORD })
        .expect(401)

      expect(res.body.error).toBe('Credenciales inválidas')
    })

    it('retorna 400 con body inválido (sin email)', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ password: MOCK_PASSWORD })
        .expect(400)

      expect(res.body.error).toBeTruthy()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /auth/me  — prueba de "acceso sin token" y "token expirado"
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /auth/me', () => {
    it('retorna 200 con los datos del usuario autenticado', async () => {
      const token = makeToken({ sub: mockUser.id, role: mockUser.role })
      mockUserFindUnique.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        phone: null,
        isActive: true,
      })

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(res.body.data.email).toBe('admin@bbc.co')
      expect(res.body.data.role).toBe(Role.ADMIN)
    })

    it('[✓ acceso sin token] retorna 401 cuando no hay Authorization header', async () => {
      const res = await request(app).get('/auth/me').expect(401)

      expect(res.body.error).toBe('Token de acceso requerido')
    })

    it('[✓ token expirado] retorna 401 con código TOKEN_EXPIRED', async () => {
      const expiredToken = makeExpiredToken({ sub: mockUser.id, role: mockUser.role })

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401)

      expect(res.body.code).toBe('TOKEN_EXPIRED')
    })

    it('retorna 401 con token malformado', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer esto-no-es-un-jwt-valido')
        .expect(401)

      expect(res.body.code).toBe('INVALID_TOKEN')
    })

    it('retorna 401 si el header no empieza por Bearer', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .expect(401)

      expect(res.body.error).toBe('Token de acceso requerido')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /auth/refresh
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /auth/refresh', () => {
    it('[✓ refresh válido] devuelve nuevo accessToken con refresh token en body', async () => {
      mockRefreshFindUnique.mockResolvedValue(mockRtRecord)
      mockUserFindUnique.mockResolvedValue(mockUser)

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token-hex-string-abc' })
        .expect(200)

      expect(res.body.accessToken).toBeTruthy()
      // El nuevo access token debe ser verificable con el mismo secret
      const decoded = jwt.verify(res.body.accessToken, JWT_SECRET) as { sub: string }
      expect(decoded.sub).toBe(mockUser.id)
    })

    it('[✓ refresh válido] devuelve nuevo accessToken con token en cookie', async () => {
      mockRefreshFindUnique.mockResolvedValue(mockRtRecord)
      mockUserFindUnique.mockResolvedValue(mockUser)

      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', 'bbc_refresh=valid-refresh-token-hex-string-abc')
        .expect(200)

      expect(res.body.accessToken).toBeTruthy()
    })

    it('retorna 401 con refresh token inexistente en DB', async () => {
      mockRefreshFindUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'token-que-no-existe' })
        .expect(401)

      expect(res.body.error).toMatch(/inválido|expirado/i)
    })

    it('retorna 401 con refresh token revocado', async () => {
      mockRefreshFindUnique.mockResolvedValue({
        ...mockRtRecord,
        revokedAt: new Date(Date.now() - 1000),
      })

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'revoked-token' })
        .expect(401)

      expect(res.body.error).toMatch(/inválido|expirado/i)
    })

    it('retorna 401 con refresh token expirado', async () => {
      mockRefreshFindUnique.mockResolvedValue({
        ...mockRtRecord,
        expiresAt: new Date(Date.now() - 1000),
      })

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'expired-refresh-token' })
        .expect(401)

      expect(res.body.error).toMatch(/inválido|expirado/i)
    })

    it('retorna 401 sin refresh token', async () => {
      const res = await request(app).post('/auth/refresh').send({}).expect(401)

      expect(res.body.error).toBe('Refresh token requerido')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /auth/logout
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /auth/logout', () => {
    it('invalida el refresh token y responde 204', async () => {
      const res = await request(app)
        .post('/auth/logout')
        .send({ refreshToken: 'some-refresh-token' })
        .expect(204)

      expect(res.body).toEqual({}) // 204 no tiene body
      expect(mockRefreshUpdateMany).toHaveBeenCalledWith({
        where: { token: 'some-refresh-token', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      })
    })

    it('responde 204 incluso si no se envía token (logout silencioso)', async () => {
      await request(app).post('/auth/logout').send({}).expect(204)
      // No debe llamar a updateMany si no hay token
      expect(mockRefreshUpdateMany).not.toHaveBeenCalled()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Autorización por rol  (usa las rutas /test/* añadidas arriba)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Autorización por rol', () => {
    it('[✓ acceso sin token] /test/admin-only retorna 401 sin Authorization', async () => {
      const res = await request(app).get('/test/admin-only').expect(401)

      expect(res.body.error).toBe('Token de acceso requerido')
    })

    it('[✓ rol insuficiente] OPERARIO accediendo a ruta ADMIN retorna 403', async () => {
      const token = makeToken({ sub: 'user-002', role: Role.OPERARIO_BODEGA })

      const res = await request(app)
        .get('/test/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(403)

      expect(res.body.code).toBe('INSUFFICIENT_ROLE')
      expect(res.body.error).toBe('Acceso denegado')
    })

    it('[✓ rol insuficiente] TRANSPORTISTA accediendo a ruta ADMIN retorna 403', async () => {
      const token = makeToken({ sub: 'user-003', role: Role.TRANSPORTISTA })

      const res = await request(app)
        .get('/test/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(403)

      expect(res.body.code).toBe('INSUFFICIENT_ROLE')
    })

    it('ADMIN accediendo a ruta ADMIN retorna 200', async () => {
      const token = makeToken({ sub: mockUser.id, role: Role.ADMIN })

      const res = await request(app)
        .get('/test/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(res.body.ok).toBe(true)
    })

    it('SUPERVISOR accediendo a ruta [ADMIN, SUPERVISOR] retorna 200', async () => {
      const token = makeToken({ sub: 'user-004', role: Role.SUPERVISOR })

      const res = await request(app)
        .get('/test/multi-role')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(res.body.ok).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /auth/change-password
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /auth/change-password', () => {
    it('cambia la contraseña exitosamente y revoca todos los refresh tokens', async () => {
      const token = makeToken({ sub: mockUser.id, role: mockUser.role })
      mockUserFindUnique.mockResolvedValue(mockUser)

      const res = await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: MOCK_PASSWORD, newPassword: 'NuevaPass123!' })
        .expect(200)

      expect(res.body.message).toMatch(/contraseña/i)
      // Debe haber actualizado el hash en DB
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockUser.id } })
      )
      // Debe haber revocado todos los refresh tokens del usuario
      expect(mockRefreshUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: mockUser.id, revokedAt: null }),
        })
      )
    })

    it('retorna 400 con contraseña actual incorrecta', async () => {
      const token = makeToken({ sub: mockUser.id, role: mockUser.role })
      mockUserFindUnique.mockResolvedValue(mockUser)

      const res = await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrong-password', newPassword: 'NuevaPass123!' })
        .expect(400)

      expect(res.body.error).toBe('Contraseña actual incorrecta')
    })

    it('retorna 400 si la nueva contraseña tiene menos de 8 caracteres', async () => {
      const token = makeToken({ sub: mockUser.id, role: mockUser.role })

      const res = await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: MOCK_PASSWORD, newPassword: 'corta' })
        .expect(400)

      expect(res.body.error).toBeTruthy()
    })

    it('retorna 401 sin autenticación', async () => {
      await request(app)
        .post('/auth/change-password')
        .send({ currentPassword: MOCK_PASSWORD, newPassword: 'NuevaPass123!' })
        .expect(401)
    })
  })
})
