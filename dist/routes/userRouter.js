const express = require('express');
const { asyncHandler } = require('../endpointHelper.js');
const { DB, Role } = require('../database/database.js');
const { authRouter, setAuth } = require('./authRouter.js');

const userRouter = express.Router();

userRouter.docs = [
  {
    method: 'GET',
    path: '/api/user/me',
    requiresAuth: true,
    description: 'Get authenticated user',
    example: `curl -X GET localhost:3000/api/user/me -H 'Authorization: Bearer tttttt'`,
    response: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] },
  },
  {
    method: 'PUT',
    path: '/api/user/:userId',
    requiresAuth: true,
    description: 'Update user',
    example: `curl -X PUT localhost:3000/api/user/1 -d '{"name":"常用名字", "email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json' -H 'Authorization: Bearer tttttt'`,
    response: { user: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] }, token: 'tttttt' },
  },
  {
    method: 'GET',
    path: '/api/user?page=1&limit=10&name=*',
    requiresAuth: true,
    description: 'Gets a list of users (admin only)',
    example: `curl -X GET 'localhost:3000/api/user?page=1&limit=10&name=*' -H 'Authorization: Bearer tttttt'`,
    response: {
      users: [
        { id: 1, name: 'Kai Chen', email: 'd@jwt.com', roles: [{ role: 'diner' }] },
        { id: 5, name: 'Buddy', email: 'b@jwt.com', roles: [{ role: 'admin' }] },
      ],
      more: true,
    },
  },
  {
    method: 'DELETE',
    path: '/api/user/:userId',
    requiresAuth: true,
    description: 'Delete a user (admin only)',
    example: `curl -X DELETE localhost:3000/api/user/3 -H 'Authorization: Bearer tttttt'`,
    response: { message: 'user deleted' },
  },
];

function isAdminUser(u) {
  return Array.isArray(u?.roles) && u.roles.some((r) => r.role === 'admin' || r.role === Role.Admin);
}

// GET /api/user/me
userRouter.get(
  '/me',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(req.user);
  })
);

// PUT /api/user/:userId
userRouter.put(
  '/:userId',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const userId = Number(req.params.userId);
    const user = req.user;

    if (user.id !== userId && !isAdminUser(user)) {
      return res.status(403).json({ message: 'unauthorized' });
    }

    const updatedUser = await DB.updateUser(userId, name, email, password);
    const auth = await setAuth(updatedUser);
    res.json({ user: updatedUser, token: auth });
  })
);

// NEW: GET /api/user (list, admin only)
userRouter.get(
  '/',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!isAdminUser(user)) {
      return res.status(403).json({ message: 'forbidden' });
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const name = (req.query.name ?? '*').toString();

    const { users, more } = await DB.listUsers({ page, limit, name });
    res.json({ users, more });
  })
);

// NEW: DELETE /api/user/:userId (admin only)
userRouter.delete(
  '/:userId',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!isAdminUser(user)) {
      return res.status(403).json({ message: 'forbidden' });
    }

    const id = Number(req.params.userId);
    const ok = await DB.deleteUser(id);
    if (!ok) {
      return res.status(404).json({ message: 'user not found' });
    }
    res.status(200).json({ message: 'user deleted' });
  })
);

module.exports = userRouter;
