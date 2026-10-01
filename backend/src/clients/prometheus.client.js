const axios = require('axios');
require('dotenv').config();

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';

async function queryPrometheus(query) {
    try {
        const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
            params: { query }
        });
        
        if (response.data && response.data.status === 'success') {
            return response.data.data;
        } else {
            throw new Error('Malformed response from Prometheus');
        }
    } catch (error) {
        if (error.response) {
            throw new Error(`Prometheus HTTP error: ${error.response.status}`);
        } else if (error.request) {
            throw new Error('Prometheus unavailable');
        } else {
            throw new Error(`Prometheus client error: ${error.message}`);
        }
    }
}

module.exports = {
    queryPrometheus
};
