const express = require('express');
const { Pool } = require('pg');
const promClient = require('prom-client');

const app = express();
const port = process.env.PORT || 3001;

// Prometheus metrics setup
const collectDefaultMetrics = promClient.collectDefaultMetrics;
const Registry = promClient.Registry;
const register = new Registry();
collectDefaultMetrics({ register });

const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});
register.registerMetric(httpRequestDurationMicroseconds);

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'code']
});
register.registerMetric(httpRequestsTotal);

app.use((req, res, next) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    httpRequestsTotal.inc({ method: req.method, route: req.route ? req.route.path : req.path, code: res.statusCode });
    end({ method: req.method, route: req.route ? req.route.path : req.path, code: res.statusCode });
  });
  next();
});

// PostgreSQL client setup
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'sentinel',
  host: process.env.POSTGRES_HOST || 'postgres',
  database: process.env.POSTGRES_DB || 'sentinel',
  password: process.env.POSTGRES_PASSWORD || 'sentinel',
  port: process.env.POSTGRES_PORT || 5432,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

app.get('/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.status(200).json({ status: 'UP', service: 'order-service', postgres: 'UP' });
  } catch (error) {
    console.error('Healthcheck failed: PostgreSQL is unavailable', error);
    res.status(503).json({ status: 'DOWN', service: 'order-service', postgres: 'DOWN', error: error.message });
  }
});

app.get('/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5');
    res.status(200).json({ 
      success: true, 
      orders: result.rows 
    });
  } catch (error) {
    console.error('Database query failed', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: Failed to fetch orders' });
  }
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

app.listen(port, () => {
  console.log(`Order service listening on port ${port}`);
});
