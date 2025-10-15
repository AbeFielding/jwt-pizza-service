const request = require('supertest');
const app = require('../src/service');
const { setAuth } = require('../src/routes/authRouter');

describe('userRouter list/delete', () => {
  test('GET /api/user without token → 401', async () => {
    const res = await request(app).get('/api/user');
    expect(res.status).toBe(401);
  });

  test('GET /api/user with non-admin token → 403', async () => {
    const [diner, dinerToken] = await registerUser(request(app));
    expect(diner).toBeDefined(); 
    const res = await request(app)
      .get('/api/user')
      .set('Authorization', `Bearer ${dinerToken}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/user with admin token → returns users list', async () => {
    const admin = { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] };
    const token = await setAuth(admin);

    const res = await request(app)
      .get('/api/user?page=1&limit=2&name=*')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body).toHaveProperty('more');
  });

  test('GET /api/user pagination: more toggles correctly', async () => {
    const admin = { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] };
    const token = await setAuth(admin);

    await Promise.all([registerUser(request(app)), registerUser(request(app)), registerUser(request(app))]);

    const page1 = await request(app)
      .get('/api/user?page=1&limit=2&name=*')
      .set('Authorization', `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.users.length).toBeLessThanOrEqual(2);
    expect(typeof page1.body.more).toBe('boolean');

    const page999 = await request(app)
      .get('/api/user?page=999&limit=2&name=*')
      .set('Authorization', `Bearer ${token}`);
    expect(page999.status).toBe(200);
    expect(Array.isArray(page999.body.users)).toBe(true);
  });

  test('GET /api/user name filter works', async () => {
    const admin = { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] };
    const token = await setAuth(admin);

    const [kai] = await registerUser(request(app), { name: 'Kai Chen' });
    expect(kai).toBeDefined();

    const res = await request(app)
      .get('/api/user?page=1&limit=10&name=Kai')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const names = res.body.users.map((u) => u.name);
    expect(names.some((n) => /kai/i.test(n))).toBe(true);
  });

  test('DELETE /api/user/:id without token → 401', async () => {
    const res = await request(app).delete('/api/user/123');
    expect(res.status).toBe(401);
  });

  test('DELETE /api/user/:id with non-admin token → 403', async () => {
    const [diner, dinerToken] = await registerUser(request(app));
    expect(diner).toBeDefined();
    const res = await request(app)
      .delete('/api/user/99999')
      .set('Authorization', `Bearer ${dinerToken}`);
    expect(res.status).toBe(403);
  });

  test('DELETE /api/user/:id with admin token → 200', async () => {
    const admin = { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] };
    const adminToken = await setAuth(admin);

    const [userToDelete] = await registerUser(request(app));

    const delRes = await request(app)
      .delete(`/api/user/${userToDelete.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect([200, 204]).toContain(delRes.status);

    const listRes = await request(app)
      .get('/api/user?page=1&limit=100&name=*')
      .set('Authorization', `Bearer ${adminToken}`);
    const ids = (listRes.body.users || []).map((u) => u.id);
    expect(ids).not.toContain(userToDelete.id);
  });

  test('DELETE /api/user/:id (non-existent) → 404', async () => {
    const admin = { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] };
    const token = await setAuth(admin);
    const res = await request(app)
      .delete('/api/user/42424242')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

async function registerUser(service, overrides = {}) {
  const name = overrides.name || 'pizza diner';
  const email = `${Math.random().toString(36).slice(2, 10)}@test.com`;
  const testUser = { name, email, password: 'a' };
  const res = await service.post('/api/auth').send(testUser);
  res.body.user.password = testUser.password;
  return [res.body.user, res.body.token];
}
