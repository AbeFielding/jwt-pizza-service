const axios = require('axios');
const config = require('./config').logging || {};

class Logger {
  constructor() {
    this.source = config.source || 'jwt-pizza-service';
    this.url = config.url;
    this.userId = config.userId;
    this.apiKey = config.apiKey;
    this.enabled = !!(this.url && this.userId && this.apiKey);
  }

  nowString() {
    return (BigInt(Date.now()) * 1000000n).toString();
  }

  statusToLevel(status) {
    if (status >= 500) return 'error';
    if (status >= 400) return 'warn';
    return 'info';
  }

  sanitize(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    let clone = JSON.parse(JSON.stringify(obj));

    const secretKeys = [
      'password', 'pwd', 'token', 'authorization', 'auth',
      'apiKey', 'apikey', 'secret', 'jwt', 'bearer'
    ];

    const scrub = (value) => {
      if (!value || typeof value !== 'object') return;

      for (const key of Object.keys(value)) {
        if (secretKeys.includes(key.toLowerCase())) {
          value[key] = '***REDACTED***';
        } else {
          scrub(value[key]);
        }
      }
    };

    scrub(clone);
    return clone;
  }

  async send(level, type, logData, metadata = {}) {
    if (!this.enabled) return;

    const body = {
      streams: [
        {
          stream: {
            source: this.source,
            level,
            type,
          },
          values: [
            [
              this.nowString(),
              JSON.stringify(this.sanitize(logData)),
              metadata,
            ],
          ],
        },
      ],
    };

    try {
      await axios.post(this.url, body, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.userId}:${this.apiKey}`,
        },
      });
    } catch (err) {
      console.log('Failed to send log:', err.message);
    }
  }

  // HTTP LOGGING
  httpLogger = (req, res, next) => {
    if (!this.enabled) return next();

    const start = Date.now();
    const chunks = [];

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    res.write = (chunk, ...args) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      return originalWrite(chunk, ...args);
    };

    res.end = (chunk, ...args) => {
      if (chunk) chunks.push(Buffer.from(chunk));

      const bodyStr = Buffer.concat(chunks).toString('utf8');
      let parsed;
      try {
        parsed = JSON.parse(bodyStr);
      } catch {
        parsed = bodyStr;
      }

      const duration = Date.now() - start;
      const status = res.statusCode;

      const logData = {
        method: req.method,
        path: req.originalUrl,
        status,
        durationMs: duration,
        hasAuthHeader: !!req.headers.authorization,
        requestBody: this.sanitize(req.body),
        responseBody: this.sanitize(parsed),
      };

      const metadata = {
        path: req.originalUrl,
        method: req.method,
        status,
      };

      const level = this.statusToLevel(status);
      this.send(level, 'http', logData, metadata);

      return originalEnd(chunk, ...args);
    };

    next();
  };

  // DB LOGGING
  db(query, params) {
    this.send('info', 'db', {
      query,
      params: this.sanitize(params)
    });
  }

  // FACTORY LOGGING
  factory(requestBody, responseBody, status) {
    const level = this.statusToLevel(status || 200);

    this.send(level, 'factory', {
      status,
      requestBody: this.sanitize(requestBody),
      responseBody: this.sanitize(responseBody)
    });
  }

  // ERROR LOGGING
  error(err, context = {}) {
    this.send('error', 'error', {
      message: err.message,
      stack: err.stack,
      context
    });
  }
}

module.exports = new Logger();
