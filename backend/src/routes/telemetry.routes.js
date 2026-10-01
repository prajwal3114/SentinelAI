const express = require('express');
const router = express.Router();
const { getMetrics, getLogs } = require('../services/telemetry.service');

const SUPPORTED_SERVICES = ['payment-service', 'order-service'];
const VALID_WINDOWS = ['1m', '5m', '10m', '15m', '30m', '1h'];

router.get('/metrics', async (req, res, next) => {
    try {
        const { service, metric, window } = req.query;

        if (!service || !SUPPORTED_SERVICES.includes(service)) {
            return res.status(400).json({ error: 'Invalid service' });
        }

        if (!window || !VALID_WINDOWS.includes(window)) {
            return res.status(400).json({ error: 'Invalid window' });
        }

        const data = await getMetrics(service, metric, window);
        res.json(data);
    } catch (error) {
        if (error.message.includes('unavailable') || error.message.includes('HTTP error') || error.message.includes('ECONNREFUSED')) {
            return res.status(502).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
});

router.get('/logs', async (req, res, next) => {
    try {
        const { service, query, limit } = req.query;

        if (!service || !SUPPORTED_SERVICES.includes(service)) {
            return res.status(400).json({ error: 'Invalid service' });
        }

        const limitNum = limit ? parseInt(limit, 10) : 20;
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
            return res.status(400).json({ error: 'Invalid limit' });
        }

        const data = await getLogs(service, query || '', limitNum);
        res.json(data);
    } catch (error) {
        if (error.message.includes('unavailable') || error.message.includes('HTTP error') || error.message.includes('ECONNREFUSED')) {
            return res.status(502).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
