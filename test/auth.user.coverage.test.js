const request = require('supertest');
const app = require('../src/service');
const { setAuth } = require('../src/routes/authRouter');

// Helpers
async function registerUser(service, overrides = {}) {
  const name = overrides.name || 'pizza diner';
  const email = overrides.email || `${Math.random().toString(36).slice(2, 10)}@test.com`;
  const password = overrides.password || 'a';
  const res = await service.post('/api/auth').send({ name, email, password });
  expect([200, 201]).toContain(res.status);
  expect(res.body).toHaveProperty('user');
  expect(res.body).toHaveProperty('token');
  return [res.body.user, res.body.token];
}

async function loginUser(service, email, password) {
  const res = await service.post('/api/auth').send({ email, password });
  expect([200, 201]).toContain(res.status);
  return [res.body.user, res.body.token];
}

describe('auth + user flows (coverage boost)', () => {
  test('helper loginUser exists', () => {
    expect(typeof loginUser).toBe('function');
  });

  test('register diner → /me works → cannot list users (403)', async () => {
    const [user, token] = await registerUser(request(app));
    expect(user.email).toMatch(/@test\.com$/);

    // /api/user/me returns the same user
    const me = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(user.email);
    expect(Array.isArray(me.body.roles)).toBe(true);

    // diner is not admin → forbidden on list
    const list = await request(app)
      .get('/api/user?page=1&limit=5&name=*')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(403);
  });

  test('self-update (PUT /api/user/:id) returns new token and persists', async () => {
    const [user, token] = await registerUser(request(app));
    const newName = user.name + 'x';
    const newEmail = user.email.replace('@', '+x@');

    // self update
    const upd = await request(app)
      .put(`/api/user/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: newName, email: newEmail });
    expect(upd.status).toBe(200);
    expect(upd.body).toHaveProperty('user');
    expect(upd.body).toHaveProperty('token');
    expect(upd.body.user.name).toBe(newName);
    expect(upd.body.user.email).toBe(newEmail);

    // /me with the NEW token should reflect changes
    const me = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${upd.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.name).toBe(newName);
    expect(me.body.email).toBe(newEmail);
  });

  test('admin can list users with pagination and name filter', async () => {
    // default admin is seeded; set auth directly
    const admin = { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] };
    const adminToken = await setAuth(admin);

    // seed a few named users
    await registerUser(request(app), { name: 'Kai Chen' });
    await registerUser(request(app), { name: 'Buddy' });
    await registerUser(request(app), { name: 'Zed' });

    // page 1
    const page1 = await request(app)
      .get('/api/user?page=1&limit=2&name=*')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page1.status).toBe(200);
    expect(Array.isArray(page1.body.users)).toBe(true);
    expect(page1.body.users.length).toBeLessThanOrEqual(2);
    expect(typeof page1.body.more).toBe('boolean');

    // filter by name
    const filtered = await request(app)
      .get('/api/user?page=1&limit=10&name=Kai')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(filtered.status).toBe(200);
    const names = filtered.body.users.map((u) => u.name || '');
    expect(names.some((n) => /kai/i.test(n))).toBe(true);
  });

  test('admin can delete a user; non-existent returns 404', async () => {
    const admin = { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] };
    const adminToken = await setAuth(admin);

    // create a user to delete
    const [toDelete] = await registerUser(request(app));

    const del = await request(app)
      .delete(`/api/user/${toDelete.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect([200, 204]).toContain(del.status);

    // deleting a bogus id returns 404
    const del404 = await request(app)
      .delete('/api/user/42424242')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del404.status).toBe(404);
  });
});
