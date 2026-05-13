// Este archivo se ejecuta ANTES de cualquier módulo del test (setupFiles en jest.config.ts).
// Establece las variables de entorno que necesita la app, sin conectarse a una DB real.
process.env.JWT_SECRET = 'test-jwt-secret-32-chars-minimum!!'
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-32chars!!'
process.env.NODE_ENV = 'test'
