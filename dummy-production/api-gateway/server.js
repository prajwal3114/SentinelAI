const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3002;

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3000';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:3001';

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'api-gateway' });
});

app.get('/payments', async (req, res) => {
  try {
    const response = await axios.get(`${PAYMENT_SERVICE_URL}/payments`);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error forwarding request to payment-service:', error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(502).json({ error: 'Bad Gateway: payment-service is unreachable' });
    }
  }
});

app.get('/orders', async (req, res) => {
  try {
    const response = await axios.get(`${ORDER_SERVICE_URL}/orders`);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Error forwarding request to order-service:', error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(502).json({ error: 'Bad Gateway: order-service is unreachable' });
    }
  }
});

app.listen(port, () => {
  console.log(`API Gateway listening on port ${port}`);
});
