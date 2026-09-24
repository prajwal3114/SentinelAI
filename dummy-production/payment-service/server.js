const express = require('express');
const redis = require('redis');
const promClient = require('prom-client');

const app = express();
const port = process.env.PORT || 3000;

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

// Redis client setup — commandsQueueMaxLength:0 makes commands fail immediately
// when disconnected instead of queuing indefinitely (prevents health endpoint hangs)
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
  socket: {
    connectTimeout: 2000,
    reconnectStrategy: (retries) => Math.min(retries * 300, 3000)
  },
  commandsQueueMaxLength: 0
});

redisClient.on('error', (err) => console.error('[payment-service] Redis error:', err.message));
redisClient.connect().catch((err) => console.error('[payment-service] Redis initial connect failed:', err.message));

app.get('/health', async (req, res) => {
  try {
    await redisClient.ping();
    res.status(200).json({ status: 'UP', service: 'payment-service', redis: 'UP' });
  } catch (error) {
    console.error('Healthcheck failed: Redis is unavailable', error);
    res.status(503).json({ status: 'DOWN', service: 'payment-service', redis: 'DOWN', error: error.message });
  }
});

app.get('/payments', async (req, res) => {
  try {
    // Perform a Redis operation
    const count = await redisClient.incr('payment_requests');
    res.status(200).json({ 
      success: true, 
      message: 'Payment processed successfully', 
      paymentId: `PAY-${Date.now()}`,
      totalPaymentsProcessed: count 
    });
  } catch (error) {
    console.error('Payment processing failed due to Redis error', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: Failed to process payment' });
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
  console.log(`Payment service listening on port ${port}`);
});
