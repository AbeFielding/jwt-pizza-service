const request = require('supertest');
const app = require('../src/service');
const { setAuth } = require('../src/routes/authRouter');

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

function expect200(res) {
  if (res.status !== 200) {
    console.error('Non-200 response:', res.status, res.body);
  }
  expect(res.status).toBe(200);
}

describe('orderRouter coverage', () => {
  test('GET /api/order/menu (public) + PUT /menu (admin) adds item', async () => {
    const initial = await request(app).get('/api/order/menu');
    expect(initial.status).toBe(200);
    expect(Array.isArray(initial.body)).toBe(true);

    const [adminUser] = await registerUser(request(app), { name: 'Menu Admin' });
    const adminToken = await setAuth({
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      roles: [{ role: 'admin' }],
    });

    const addItem = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Student',
        description: 'No topping, no sauce, just carbs',
        image: 'pizza9.png',
        price: 0.0001,
      });
    expect200(addItem);
    expect(Array.isArray(addItem.body)).toBe(true);
    expect(addItem.body.some((m) => m.title === 'Student')).toBe(true);
  });

  test('GET /api/order (auth) returns user orders; POST /api/order creates and returns jwt', async () => {
    // Create a real user and "promote" them to admin for this test
    const [ownerUser] = await registerUser(request(app), { name: 'Fran Owner' });
    const adminToken = await setAuth({
      id: ownerUser.id,
      email: ownerUser.email,
      name: ownerUser.name,
      roles: [{ role: 'admin' }],
    });

    // Use unique names to avoid DB uniqueness collisions across runs
    const fname = `orderFranchise-${Math.random().toString(36).slice(2, 8)}`;
    const sname = `Main-${Math.random().toString(36).slice(2, 6)}`;

    // Create a franchise (admin emails must already exist)
    const createFranchise = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: fname, admins: [{ email: ownerUser.email }] });
    expect200(createFranchise);
    const franchiseId = createFranchise.body.id;

    // Create a store
    const createStore = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: sname });
    expect200(createStore);
    const storeId = createStore.body.id;

    // Ensure a menu item exists
    const menuRes = await request(app).get('/api/order/menu');
    let menuId;
    if (menuRes.body?.length > 0) {
      menuId = menuRes.body[0].id;
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
      expect200(addItem);
      menuId = addItem.body[0].id;
    }

    // Register a diner and place an order
    const [diner, dinerToken] = await registerUser(request(app));
    expect(diner).toBeDefined();

    const createOrder = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${dinerToken}`)
      .send({
        franchiseId,
        storeId,
        items: [{ menuId, description: 'Veggie', price: 0.05 }],
      });
    expect200(createOrder);
    expect(createOrder.body).toHaveProperty('order');
    expect(createOrder.body).toHaveProperty('jwt');
    expect(createOrder.body).toHaveProperty('followLinkToEndChaos');

    const getOrders = await request(app)
      .get('/api/order?page=1')
      .set('Authorization', `Bearer ${dinerToken}`);
    expect200(getOrders);
    expect(getOrders.body).toHaveProperty('orders');
    expect(Array.isArray(getOrders.body.orders)).toBe(true);
  });

  test('PUT /api/order/menu denies non-admin (403)', async () => {
    const [diner, dinerToken] = await registerUser(request(app));
    expect(diner).toBeDefined();
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
