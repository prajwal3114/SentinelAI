const { queryPrometheus } = require('../clients/prometheus.client');
const { queryLoki } = require('../clients/loki.client');

async function getMetrics(service, metric, window) {
    if (metric !== 'error_rate') {
        throw new Error(`Unsupported metric: ${metric}`);
    }

    // Usually Prometheus job names match the docker compose service name, e.g., sentinel-payment-service.
    // However, the instructions say the service requested will be like 'payment-service'.
    // Let's use a regex to match either payment-service or sentinel-payment-service for job or container_name.
    // PromQL for error rate: 5xx / total.
    const query = `
        sum(rate(http_requests_total{service=~".*${service}.*", status=~"5.."}[${window}])) or sum(rate(http_requests_total{job=~".*${service}.*", status=~"5.."}[${window}]))
        / 
        sum(rate(http_requests_total{service=~".*${service}.*"}[${window}])) or sum(rate(http_requests_total{job=~".*${service}.*"}[${window}])) * 100
    `;
    const previousQuery = `
        sum(rate(http_requests_total{service=~".*${service}.*", status=~"5.."}[${window}] offset ${window})) or sum(rate(http_requests_total{job=~".*${service}.*", status=~"5.."}[${window}] offset ${window}))
        / 
        sum(rate(http_requests_total{service=~".*${service}.*"}[${window}] offset ${window})) or sum(rate(http_requests_total{job=~".*${service}.*"}[${window}] offset ${window})) * 100
    `;

    // To be safer because `or` might not work correctly if both sides of division use `or`.
    // Let's simplify. Promtail/prometheus usually scrape with container_name or job.
    // Let's use `{job=~".*${service}.*"}` which is very common.
    const querySafe = `
        sum(rate(http_requests_total{job=~".*${service}.*", status=~"5.."}[${window}])) 
        / 
        sum(rate(http_requests_total{job=~".*${service}.*"}[${window}])) * 100
    `;
    const previousQuerySafe = `
        sum(rate(http_requests_total{job=~".*${service}.*", status=~"5.."}[${window}] offset ${window})) 
        / 
        sum(rate(http_requests_total{job=~".*${service}.*"}[${window}] offset ${window})) * 100
    `;

    const [currentResult, previousResult] = await Promise.all([
        queryPrometheus(querySafe),
        queryPrometheus(previousQuerySafe)
    ]);

    const extractValue = (result) => {
        if (result && result.result && result.result.length > 0) {
            const val = parseFloat(result.result[0].value[1]);
            return isNaN(val) ? 0 : val;
        }
        return 0;
    };

    const currentValue = extractValue(currentResult);
    const prevValue = extractValue(previousResult);

    let trend = 'stable';
    if (currentValue > prevValue + 10) {
        trend = 'spiking';
    } else if (currentValue > prevValue + 2) {
        trend = 'rising';
    } else if (currentValue < prevValue - 2) {
        trend = 'falling';
    }

    return {
        value: Number(currentValue.toFixed(2)),
        unit: 'percent',
        trend
    };
}

async function getLogs(service, queryStr, limit) {
    let logql = `{job="docker"} |= "[${service}]"`;
    if (queryStr) {
        logql += ` |= \`${queryStr}\``;
    }

    const lokiData = await queryLoki(logql, limit);

    const logs = [];
    if (lokiData && lokiData.result) {
        for (const stream of lokiData.result) {
            if (stream.values) {
                for (const val of stream.values) {
                    logs.push({
                        timestamp: val[0],
                        message: val[1].trim()
                    });
                }
            }
        }
    }

    logs.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    
    return {
        service,
        count: Math.min(logs.length, limit),
        logs: logs.slice(0, limit)
    };
}

module.exports = {
    getMetrics,
    getLogs
};
