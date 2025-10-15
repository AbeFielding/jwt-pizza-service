const request = require('supertest');
const app = require('../src/service');
const { setAuth } = require('../src/routes/authRouter');

async function registerUser(service, { name = 'franchise user', email, password = 'a' } = {}) {
  email = email || `${Math.random().toString(36).slice(2, 10)}@test.com`;
  const res = await service.post('/api/auth').send({ name, email, password });
  expect([200, 201]).toContain(res.status);
  return [res.body.user, res.body.token];
}

describe('franchiseRouter coverage', () => {
  test('GET /api/franchise (public list) returns {franchises, more}', async () => {
    const res = await request(app).get('/api/franchise?page=0&limit=5&name=*');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('franchises');
    expect(res.body).toHaveProperty('more');
    expect(Array.isArray(res.body.franchises)).toBe(true);
  });

  test('GET /api/franchise/:userId (must be self or admin)', async () => {
    const [diner, dinerToken] = await registerUser(request(app));

    // self access: allowed
    const selfRes = await request(app)
      .get(`/api/franchise/${diner.id}`)
      .set('Authorization', `Bearer ${dinerToken}`);
    expect(selfRes.status).toBe(200);
    expect(Array.isArray(selfRes.body)).toBe(true);

    // admin access: allowed
    const admin = { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] };
    const adminToken = await setAuth(admin);
    const adminRes = await request(app)
      .get(`/api/franchise/${diner.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(Array.isArray(adminRes.body)).toBe(true);
  });

  test('POST /api/franchise requires admin; then create + delete store', async () => {
    // Non-admin forbidden
    const [diner, dinerToken] = await registerUser(request(app));
    const nonAdminCreate = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send({ name: 'pizzaPocket', admins: [{ email: diner.email }] });
    expect(nonAdminCreate.status).toBe(403);

    // Admin can create a franchise; admin email(s) must exist
    const admin = { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] };
    const adminToken = await setAuth(admin);

    // Use an existing user as a franchise admin (the diner we registered)
    const createFranchise = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'pizzaPocket', admins: [{ email: diner.email }] });
    expect(createFranchise.status).toBe(200);
    expect(createFranchise.body).toHaveProperty('id');
    const franchiseId = createFranchise.body.id;

    // Admin can create a store on that franchise
    const createStore = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'SLC' });
    expect(createStore.status).toBe(200);
    expect(createStore.body).toHaveProperty('id');
    const storeId = createStore.body.id;

    // Non-admin, non-franchise-admin cannot create a store
    const [stranger, strangerToken] = await registerUser(request(app));
    expect(stranger).toBeDefined();
    const createStoreForbidden = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ name: 'Nope' });
    expect(createStoreForbidden.status).toBe(403);

    // Admin can delete the store
    const delStore = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delStore.status).toBe(200);
    expect(delStore.body).toHaveProperty('message');

    // DELETE franchise route (note: this route currently has no auth middleware)
    const delFranchise = await request(app).delete(`/api/franchise/${franchiseId}`);
    expect(delFranchise.status).toBe(200);
    expect(delFranchise.body).toHaveProperty('message', 'franchise deleted');
  });
});
