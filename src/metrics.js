const axios = require('axios');
const os = require('os');
const { metrics = {} } = require('./config');

class Metrics {
  constructor() {
    this.url = metrics.url || '';
    this.apiKey = metrics.apiKey || '';
    this.source = metrics.source || 'jwt-pizza-service-dev';

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
      const m = (req.method || '').toLowerCase();
      if (m && this.req[m] !== undefined) this.req[m]++;
      const dur = Date.now() - start;
      this.latencySamples.push(dur);
      if (this.latencySamples.length > 200) this.latencySamples.shift();
    });
    next();
  };

  recordAuth(success) {
    if (success) this.auth.success++;
    else this.auth.fail++;
  }

  recordPizza(success, latencyMs, price) {
    if (success) {
      this.pizza.sold++;
      this.pizza.revenue += Number(price || 0);
    } else {
      this.pizza.failed++;
    }
    if (Number.isFinite(latencyMs)) {
      this.latencySamples.push(latencyMs);
      if (this.latencySamples.length > 200) this.latencySamples.shift();
    }
  }

  getSystem() {
    const cpu = os.cpus()?.length ? (os.loadavg()[0] / os.cpus().length) * 100 : 0;
    const mem = os.totalmem()
      ? ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
      : 0;
    return { cpu: Number.isFinite(cpu) ? cpu.toFixed(2) : '0.00', mem: Number.isFinite(mem) ? mem.toFixed(2) : '0.00' };
  }

  canSend() {
    if (process.env.NODE_ENV === 'test') return false;
    if (!this.url || !this.apiKey) return false;
    return true;
  }

  async push() {
    const avgLatency =
      this.latencySamples.length === 0
        ? 0
        : this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;

    const sys = this.getSystem();
    const src = this.source.replace(/"/g, '');

    const lines = [
      `http_requests_total{source="${src}"} ${this.req.total}`,
      `http_requests_get{source="${src}"} ${this.req.get}`,
      `http_requests_post{source="${src}"} ${this.req.post}`,
      `http_requests_put{source="${src}"} ${this.req.put}`,
      `http_requests_delete{source="${src}"} ${this.req.delete}`,
      `auth_success_total{source="${src}"} ${this.auth.success}`,
      `auth_fail_total{source="${src}"} ${this.auth.fail}`,
      `pizza_sold_total{source="${src}"} ${this.pizza.sold}`,
      `pizza_failed_total{source="${src}"} ${this.pizza.failed}`,
      `pizza_revenue_total{source="${src}"} ${this.pizza.revenue}`,
      `latency_avg_ms{source="${src}"} ${avgLatency.toFixed(2)}`,
      `system_cpu_percent{source="${src}"} ${sys.cpu}`,
      `system_mem_percent{source="${src}"} ${sys.mem}`,
    ];
    const body = lines.join('\n');

    if (!this.canSend()) {
      this.resetCounters();
      return;
    }

    try {
      await axios.post(this.url, body, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'text/plain',
        },
        timeout: 5000,
      });
    } catch (e) {
      console.error('metrics push failed:', e?.message || e);
    } finally {
      this.resetCounters();
    }
  }

  start(intervalMs = 60000) {
    if (this._timer) return;
    this._timer = setInterval(() => this.push(), intervalMs);
    if (this._timer.unref) this._timer.unref();
  }
}

module.exports = new Metrics();
