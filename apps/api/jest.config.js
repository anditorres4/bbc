/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@bbc/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@bbc/utils$': '<rootDir>/../../packages/utils/src/index.ts',
  },
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  clearMocks: true,
  verbose: true,
}

module.exports = config
