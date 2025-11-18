const express = require('express');
const { authRouter, setAuthUser } = require('./routes/authRouter.js');
const orderRouter = require('./routes/orderRouter.js');
const franchiseRouter = require('./routes/franchiseRouter.js');
const userRouter = require('./routes/userRouter.js');
const version = require('./version.json');
const config = require('./config.js');
const metrics = require('./metrics');
const logger = require('./logger');

const app = express();
app.use(express.json());
app.use(logger.httpLogger);

app.use(setAuthUser);

metrics.start(60000);
app.use(metrics.requestTracker);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// Routers
const apiRouter = express.Router();
app.use('/api', apiRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/user', userRouter);
apiRouter.use('/order', orderRouter);
apiRouter.use('/franchise', franchiseRouter);

apiRouter.use('/docs', (req, res) => {
  res.json({
    version: version.version,
    endpoints: [
      ...authRouter.docs,
      ...userRouter.docs,
      ...orderRouter.docs,
      ...franchiseRouter.docs,
    ],
    config: { factory: config.factory.url, db: config.db.connection.host },
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'welcome to JWT Pizza',
    version: version.version,
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ message: 'unknown endpoint' });
});

app.use((err, req, res, next) => {
  logger.error(err, {
    method: req.method,
    path: req.originalUrl
  });

  next(err);
});

app.use((err, req, res, next) => {
  res.status(err.statusCode ?? 500).json({ message: err.message, stack: err.stack });
});

module.exports = app;
