const request = require('supertest');
const app = require('../src/service');
const { setAuth } = require('../src/routes/authRouter');

// simple global fetch mock for the factory call
beforeAll(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ reportUrl: 'http://factory/report/123', jwt: 'factory.jwt.value' }),
  }));
});

afterAll(() => {
  delete global.fetch;
});

async function registerUser(service, { name = 'order diner', email, password = 'a' } = {}) {
  email = email || `${Math.random().toString(36).slice(2, 10)}@test.com`;
  const res = await service.post('/api/auth').send({ name, email, password });
  expect([200, 201]).toContain(res.status);
  return [res.body.user, res.body.token];
}

describe('orderRouter coverage', () => {
  test('GET /api/order/menu (public) + PUT /menu (admin) adds item', async () => {
    // public GET menu
    const initial = await request(app).get('/api/order/menu');
    expect(initial.status).toBe(200);
    expect(Array.isArray(initial.body)).toBe(true);

    // admin adds a menu item
    const admin = { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] };
    const adminToken = await setAuth(admin);

    const addItem = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Student',
        description: 'No topping, no sauce, just carbs',
        image: 'pizza9.png',
        price: 0.0001,
      });
    expect(addItem.status).toBe(200);
    expect(Array.isArray(addItem.body)).toBe(true);
    const hasStudent = addItem.body.some((m) => m.title === 'Student');
    expect(hasStudent).toBe(true);
  });

  test('GET /api/order (auth) returns user orders; POST /api/order creates and returns jwt', async () => {
    // Make sure we have a franchise+store (admin creates them)
    const admin = { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] };
    const adminToken = await setAuth(admin);

    // Create a franchise (use admin as franchise admin to satisfy DB.createFranchise)
    const createFranchise = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'orderFranchise', admins: [{ email: 'a@jwt.com' }] });
    expect(createFranchise.status).toBe(200);
    const franchiseId = createFranchise.body.id;

    // Create a store
    const createStore = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Main' });
    expect(createStore.status).toBe(200);
    const storeId = createStore.body.id;

    // Ensure we have at least one menu item (admin adds if needed)
    const menu = await request(app).get('/api/order/menu');
    let menuId;
    if (menu.body.length > 0) {
      menuId = menu.body[0].id;
    } else {
      const addItem = await request(app)
        .put('/api/order/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Veggie',
          description: 'A garden of delight',
          image: 'pizza1.png',
          price: 0.0038,
        });
      expect(addItem.status).toBe(200);
      menuId = addItem.body[0].id;
    }

    // Register diner
    const [diner, dinerToken] = await registerUser(request(app));

    // POST create order (this triggers mocked global.fetch to the factory)
    const createOrder = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send({
        franchiseId,
        storeId,
        items: [{ menuId, description: 'Veggie', price: 0.05 }],
      });
    expect(createOrder.status).toBe(200);
    expect(createOrder.body).toHaveProperty('order');
    expect(createOrder.body).toHaveProperty('jwt');
    expect(createOrder.body).toHaveProperty('followLinkToEndChaos'); // from mocked factory

    // GET orders for diner
    const getOrders = await request(app)
      .get('/api/order?page=1')
      .set('Authorization', `Bearer ${dinerToken}`);
    expect(getOrders.status).toBe(200);
    expect(getOrders.body).toHaveProperty('orders');
    expect(Array.isArray(getOrders.body.orders)).toBe(true);
  });

  test('PUT /api/order/menu denies non-admin (403)', async () => {
    const [diner, dinerToken] = await registerUser(request(app));
    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send({
        title: 'Nope',
        description: 'Forbidden',
        image: 'x.png',
        price: 1,
      });
    expect(res.status).toBe(403);
  });
});
