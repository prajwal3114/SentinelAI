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

// Redis client setup.
// reconnectStrategy keeps the client alive so it recovers when Redis comes back.
// commandsQueueMaxLength: 0 is kept but is insufficient during reconnect cycles —
// the isReady guard + withTimeout below are the real protection.
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

/**
 * Wrap a Redis command promise with a hard timeout.
 *
 * WHY: When the redis v4 client is in reconnect mode (isOpen=true, isReady=false),
 * issuing a command enqueues it in an internal offline queue and the returned
 * promise NEVER settles — commandsQueueMaxLength:0 does NOT prevent this during
 * reconnect cycles. The timeout ensures the request always returns within
 * REDIS_COMMAND_TIMEOUT_MS regardless.
 */
const REDIS_COMMAND_TIMEOUT_MS = 1500;

function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Redis command timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

app.get('/health', async (req, res) => {
  // Fast-fail: if client is clearly not ready, skip the command entirely
  if (!redisClient.isReady) {
    return res.status(503).json({ status: 'DOWN', service: 'payment-service', redis: 'DOWN', error: 'Redis not connected' });
  }
  try {
    await withTimeout(redisClient.ping(), REDIS_COMMAND_TIMEOUT_MS);
    res.status(200).json({ status: 'UP', service: 'payment-service', redis: 'UP' });
  } catch (error) {
    console.error('[payment-service] Healthcheck failed: Redis is unavailable:', error.message);
    res.status(503).json({ status: 'DOWN', service: 'payment-service', redis: 'DOWN', error: 'Redis unavailable' });
  }
});

app.get('/payments', async (req, res) => {
  // Fast-fail: if client is clearly not ready, skip the command entirely
  if (!redisClient.isReady) {
    console.error('[payment-service] /payments: Redis not ready, failing fast');
    return res.status(503).json({ error: 'Payment service dependency unavailable' });
  }
  try {
    // withTimeout guards against Redis becoming unavailable between the isReady
    // check above and actual command execution (race condition window).
    const count = await withTimeout(redisClient.incr('payment_requests'), REDIS_COMMAND_TIMEOUT_MS);
    res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      paymentId: `PAY-${Date.now()}`,
      totalPaymentsProcessed: count
    });
  } catch (error) {
    console.error('[payment-service] Payment processing failed due to Redis error:', error.message);
    res.status(500).json({ error: 'Payment service dependency unavailable' });
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
