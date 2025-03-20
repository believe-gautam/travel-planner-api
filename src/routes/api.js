 
const express = require('express');
const axios = require('axios');
const { pool } = require('../config/db');
const { getCache, setCache, delCache } = require('../cache/cache');

const router = express.Router();

// Add Provider
router.post('/providers', async (req, res) => {
  const { provider_name, api_key, base_url, auth_details } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO providers (provider_name, api_key, base_url, auth_details) VALUES ($1, $2, $3, $4) RETURNING *',
      [provider_name, api_key, base_url, JSON.stringify(auth_details)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Endpoint
router.post('/endpoints', async (req, res) => {
  const { provider_id, type, endpoint, http_method, parameters, response_mapping, test_payload } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO endpoints (provider_id, type, endpoint, http_method, parameters, response_mapping, test_payload) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [provider_id, type, endpoint, http_method, JSON.stringify(parameters), JSON.stringify(response_mapping), JSON.stringify(test_payload)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Compare Prices
router.post('/compare-prices', async (req, res) => {
  const { Lat, Long, userId = 'user123' } = req.body;
  const cacheKey = `${userId}:lat${Lat}-long${Long}`;

  try {
    // Check cache
    const cachedResult = await getCache(cacheKey);
    if (cachedResult) return res.json({ cached: true, data: cachedResult });

    // Fetch providers and endpoints
    const providers = await pool.query('SELECT * FROM providers');
    const endpoints = await pool.query('SELECT * FROM endpoints WHERE status = $1', ['active']);

    const results = await Promise.all(
      endpoints.rows.map(async (endpoint) => {
        const provider = providers.rows.find(p => p.provider_id === endpoint.provider_id);
        if (!provider) return null;

        try {
          const response = await axios({
            method: endpoint.http_method,
            url: `${provider.base_url}${endpoint.endpoint}`,
            headers: provider.auth_details?.headers || {},
            data: endpoint.test_payload || { Lat, Long },
            timeout: 10000,
          });

          const mappedResult = endpoint.response_mapping
            ? Object.keys(endpoint.response_mapping).reduce((acc, key) => {
                acc[key] = response.data[endpoint.response_mapping[key]];
                return acc;
              }, {})
            : { price: response.data.price || 'N/A', name: provider.provider_name };

          return mappedResult;
        } catch (err) {
          await pool.query('UPDATE endpoints SET last_error = $1 WHERE endpoint_id = $2', [err.message, endpoint.endpoint_id]);
          return null;
        }
      })
    );

    const filteredResults = results.filter(r => r !== null);
    await setCache(cacheKey, filteredResults);
    res.json({ cached: false, data: filteredResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;