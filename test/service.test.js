const request = require('supertest');

jest.mock('../src/config.js', () => ({
  factory: { url: 'https://mock-factory' },
  db: { connection: { host: 'localhost' } },
}), { virtual: false });

jest.mock('../src/routes/authRouter.js', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/ping', (_, res) => res.json({ ok: true, base: '/auth' }));
  router.docs = [{ method: 'GET', path: '/auth/ping' }];
  const setAuthUser = (_req, _res, next) => next();
  return { authRouter: router, setAuthUser };
}, { virtual: false });

jest.mock('../src/routes/userRouter.js', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/ping', (_, res) => res.json({ ok: true, base: '/user' }));
  router.docs = [{ method: 'GET', path: '/user/ping' }];
  return router;
}, { virtual: false });

jest.mock('../src/routes/orderRouter.js', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/ping', (_, res) => res.json({ ok: true, base: '/order' }));
  router.docs = [{ method: 'GET', path: '/order/ping' }];
  return router;
}, { virtual: false });

jest.mock('../src/routes/franchiseRouter.js', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/ping', (_, res) => res.json({ ok: true, base: '/franchise' }));
  router.docs = [{ method: 'GET', path: '/franchise/ping' }];
  return router;
}, { virtual: false });

const app = require('../src/service');

describe('service shell', () => {
  test('GET / returns welcome + version', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toHaveProperty('message', 'welcome to JWT Pizza');
    expect(res.body).toHaveProperty('version');
  });

  test('CORS headers present', async () => {
    const res = await request(app).get('/');
    expect(res.headers).toHaveProperty('access-control-allow-origin');
    expect(res.headers).toHaveProperty('access-control-allow-methods');
    expect(res.headers).toHaveProperty('access-control-allow-headers');
    expect(res.headers).toHaveProperty('access-control-allow-credentials');
  });

  test('GET /api/docs aggregates router docs + shows config', async () => {
    const res = await request(app).get('/api/docs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.endpoints)).toBe(true);
    expect(res.body.endpoints.length).toBe(4);
    expect(res.body.config).toMatchObject({ factory: 'https://mock-factory', db: 'localhost' });
    expect(res.body).toHaveProperty('version');
  });

  test('unknown route -> 404 JSON', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'unknown endpoint' });
  });
});
