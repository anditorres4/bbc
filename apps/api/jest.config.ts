import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@bbc/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@bbc/utils$': '<rootDir>/../../packages/utils/src/index.ts',
  },
  // Carga variables de entorno antes de que se importen los módulos
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  clearMocks: true,
  // Muestra cada test con su nombre en la salida
  verbose: true,
}

export default config
