const axios = require('axios');
const os = require('os');
const { metrics } = require('./config');

class Metrics {
  constructor() {
    this.url = metrics.url;
    this.apiKey = metrics.apiKey;
    this.source = metrics.source;

    this.resetCounters();
  }

  resetCounters() {
    this.req = { total: 0, get: 0, post: 0, put: 0, delete: 0 };
    this.auth = { success: 0, fail: 0 };
    this.pizza = { sold: 0, failed: 0, revenue: 0 };
    this.latencySamples = [];
  }

  requestTracker = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      this.req.total++;
      const method = req.method.toLowerCase();
      if (this.req[method] !== undefined) this.req[method]++;
      const dur = Date.now() - start;
      this.latencySamples.push(dur);
      if (this.latencySamples.length > 100) this.latencySamples.shift();
    });
    next();
  };

  recordAuth(success) {
    success ? this.auth.success++ : this.auth.fail++;
  }

  recordPizza(success, latency, price) {
    if (success) {
      this.pizza.sold++;
      this.pizza.revenue += price;
    } else {
      this.pizza.failed++;
    }
    this.latencySamples.push(latency);
  }

  getSystem() {
    const cpu = (os.loadavg()[0] / os.cpus().length) * 100;
    const mem = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
    return { cpu: cpu.toFixed(2), mem: mem.toFixed(2) };
  }

  async push() {
    const avgLatency =
      this.latencySamples.length === 0
        ? 0
        : this.latencySamples.reduce((a, b) => a + b, 0) /
          this.latencySamples.length;

    const sys = this.getSystem();

    const body = [
      `http_requests_total{source="${this.source}"} ${this.req.total}`,
      `http_requests_get{source="${this.source}"} ${this.req.get}`,
      `http_requests_post{source="${this.source}"} ${this.req.post}`,
      `http_requests_put{source="${this.source}"} ${this.req.put}`,
      `http_requests_delete{source="${this.source}"} ${this.req.delete}`,
      `auth_success_total{source="${this.source}"} ${this.auth.success}`,
      `auth_fail_total{source="${this.source}"} ${this.auth.fail}`,
      `pizza_sold_total{source="${this.source}"} ${this.pizza.sold}`,
      `pizza_failed_total{source="${this.source}"} ${this.pizza.failed}`,
      `pizza_revenue_total{source="${this.source}"} ${this.pizza.revenue}`,
      `latency_avg_ms{source="${this.source}"} ${avgLatency.toFixed(2)}`,
      `system_cpu_percent{source="${this.source}"} ${sys.cpu}`,
      `system_mem_percent{source="${this.source}"} ${sys.mem}`,
    ].join('\n');

    try {
      await axios.post(this.url, body, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'text/plain',
        },
        timeout: 5000,
      });
      this.resetCounters();
    } catch (err) {
      console.error('Error sending metrics:', err.message);
    }
  }

  start(intervalMs = 60000) {
    setInterval(() => this.push(), intervalMs);
  }
}

module.exports = new Metrics();
