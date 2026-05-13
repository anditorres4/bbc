import request from 'supertest'

describe('CORS configuration', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env.NODE_ENV = 'test'
  })

  it('allows exact origins from a comma-separated CORS_ORIGIN list', async () => {
    process.env.CORS_ORIGIN = 'https://bbc-web-bay.vercel.app, https://admin.example.com/'
    const { app } = require('../app')

    const res = await request(app)
      .options('/auth/me')
      .set('Origin', 'https://bbc-web-bay.vercel.app')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Authorization, Content-Type')
      .expect(204)

    expect(res.headers['access-control-allow-origin']).toBe('https://bbc-web-bay.vercel.app')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('allows wildcard origins such as Vercel preview deployments', async () => {
    process.env.CORS_ORIGIN = 'https://*.vercel.app'
    const { app } = require('../app')

    const res = await request(app)
      .options('/auth/me')
      .set('Origin', 'https://bbc-web-git-feature-x-aneto.vercel.app')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204)

    expect(res.headers['access-control-allow-origin']).toBe(
      'https://bbc-web-git-feature-x-aneto.vercel.app'
    )
  })

  it('rejects origins outside the allow list', async () => {
    process.env.CORS_ORIGIN = 'https://bbc-web-bay.vercel.app'
    const { app } = require('../app')

    await request(app)
      .options('/auth/me')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'GET')
      .expect(500)
  })
})
