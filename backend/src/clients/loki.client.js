const axios = require('axios');
require('dotenv').config();

const LOKI_URL = process.env.LOKI_URL || 'http://localhost:3100';

async function queryLoki(query, limit = 20) {
    try {
        const response = await axios.get(`${LOKI_URL}/loki/api/v1/query_range`, {
            params: {
                query,
                limit
            }
        });
        
        if (response.data && response.data.status === 'success') {
            return response.data.data;
        } else {
            throw new Error('Malformed response from Loki');
        }
    } catch (error) {
        if (error.response) {
            throw new Error(`Loki HTTP error: ${error.response.status}`);
        } else if (error.request) {
            throw new Error('Loki unavailable');
        } else {
            throw new Error(`Loki client error: ${error.message}`);
        }
    }
}

module.exports = {
    queryLoki
};
