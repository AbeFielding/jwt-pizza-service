const axios = require('axios');
const os = require('os');

let metricsConfig = {};
try {
  metricsConfig = require('./config').metrics || {};
} catch {
  metricsConfig = {};
}

class Metrics {
  constructor() {
    this.url = metricsConfig.url || '';
    this.apiKey = metricsConfig.apiKey || '';
    this.source = metricsConfig.source || 'jwt-pizza-service-dev';
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
    return {
      cpu: Number.isFinite(cpu) ? cpu.toFixed(2) : '0.00',
      mem: Number.isFinite(mem) ? mem.toFixed(2) : '0.00',
    };
  }

  async push() {
    if (process.env.NODE_ENV === 'test' || !this.url || !this.apiKey) {
      this.resetCounters();
      return;
    }

    const avgLatency =
      this.latencySamples.length === 0
        ? 0
        : this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;

    const sys = this.getSystem();
    const now = Date.now() * 1_000_000;

    const makeGauge = (name, value, unit = '%') => ({
      name,
      unit,
      gauge: {
        dataPoints: [
          {
            asDouble: value,
            timeUnixNano: now,
            attributes: [{ key: 'source', value: { stringValue: this.source } }],
          },
        ],
      },
    });

    const makeSum = (name, value, unit = '1') => ({
      name,
      unit,
      sum: {
        aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
        isMonotonic: true,
        dataPoints: [
          {
            asDouble: value,
            timeUnixNano: now,
            attributes: [{ key: 'source', value: { stringValue: this.source } }],
          },
        ],
      },
    });

    const metricsList = [
      makeSum('http_requests_total', this.req.total),
      makeSum('http_requests_get', this.req.get),
      makeSum('http_requests_post', this.req.post),
      makeSum('http_requests_put', this.req.put),
      makeSum('http_requests_delete', this.req.delete),
      makeSum('auth_success_total', this.auth.success),
      makeSum('auth_fail_total', this.auth.fail),
      makeSum('pizza_sold_total', this.pizza.sold),
      makeSum('pizza_failed_total', this.pizza.failed),
      makeSum('pizza_revenue_total', this.pizza.revenue, 'usd'),
      makeGauge('latency_avg_ms', avgLatency, 'ms'),
      makeGauge('system_cpu_percent', sys.cpu, '%'),
      makeGauge('system_mem_percent', sys.mem, '%'),
    ];

    try {
      await axios.post(
        this.url,
        { resourceMetrics: [{ scopeMetrics: [{ metrics: metricsList }] }] },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Basic ' + Buffer.from(this.apiKey.trim()).toString('base64'),
          },
        }
      );
      console.log('📡 Metrics sent to Grafana');
    } catch (e) {
      console.error('❌ Metrics push failed:', e.message);
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
