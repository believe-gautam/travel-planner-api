const express = require('express');
const axios = require('axios');
const { pool } = require('../config/db');
const { getCache, setCache, delCache } = require('../cache/cache');
const logger = require('../logger/logger');

const router = express.Router();

// Configure Provider + Multiple Endpoints
router.post('/configure', async (req, res) => {
  const {
    provider_name, api_key, base_url, auth_details, endpoints
  } = req.body;

  if (!endpoints || !Array.isArray(endpoints) || endpoints.length === 0) {
    logger.warn('No endpoints provided in configuration', { provider_name });
    return res.status(400).json({ error: 'At least one endpoint is required' });
  }

  try {
    logger.info('Configuring new provider with endpoints', { provider_name, endpoint_count: endpoints.length });
    const providerResult = await pool.query(
      'INSERT INTO providers (provider_name, api_key, base_url, auth_details) VALUES ($1, $2, $3, $4) RETURNING provider_id',
      [provider_name, api_key, base_url, JSON.stringify(auth_details)]
    );
    const providerId = providerResult.rows[0].provider_id;

    const endpointResults = [];
    for (const endpoint of endpoints) {
      const { type, endpoint: endpointPath, http_method, parameters, response_mapping, test_payload } = endpoint;
      const result = await pool.query(
        'INSERT INTO endpoints (provider_id, type, endpoint, http_method, parameters, response_mapping, test_payload) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [providerId, type, endpointPath, http_method, JSON.stringify(parameters), JSON.stringify(response_mapping), JSON.stringify(test_payload)]
      );
      endpointResults.push(result.rows[0]);
    }

    logger.info('Configuration added successfully', { provider_id: providerId, endpoint_ids: endpointResults.map(e => e.endpoint_id) });
    res.status(201).json({
      provider: { provider_id: providerId, provider_name, base_url },
      endpoints: endpointResults
    });
  } catch (err) {
    logger.error('Configuration failed', { error: err.message, provider_name });
    res.status(500).json({ error: err.message });
  }
});

// Compare Prices by Type
router.post('/compare-prices', async (req, res) => {
  const { Lat, Long, type, userId = 'user123' } = req.body;
  if (!type) {
    logger.warn('Missing type in compare-prices request', { Lat, Long });
    return res.status(400).json({ error: 'Type is required (e.g., flight, car, hotels, activities)' });
  }

  const cacheKey = `${userId}:${type}:lat${Lat}-long${Long}`;

  try {
    const cachedResult = await getCache(cacheKey);
    if (cachedResult) return res.json({ cached: true, data: cachedResult });

    logger.info('Fetching endpoints for price comparison', { type, Lat, Long });
    const endpoints = await pool.query('SELECT * FROM endpoints WHERE type = $1 AND status = $2', [type, 'active']);
    if (endpoints.rows.length === 0) {
      logger.warn('No active endpoints found', { type });
      return res.status(404).json({ error: `No active endpoints found for type: ${type}` });
    }

    const providers = await pool.query('SELECT * FROM providers');

    const results = await Promise.all(
      endpoints.rows.map(async (endpoint) => {
        const provider = providers.rows.find(p => p.provider_id === endpoint.provider_id);
        if (!provider) {
          logger.warn('Provider not found for endpoint', { endpoint_id: endpoint.endpoint_id });
          return null;
        }

        try {
          logger.info('Calling external API', { provider: provider.provider_name, endpoint: endpoint.endpoint });
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

          logger.info('API call successful', { provider: provider.provider_name, price: mappedResult.price });
          return mappedResult;
        } catch (err) {
          logger.error('API call failed', {
            provider: provider.provider_name,
            endpoint: endpoint.endpoint,
            error: err.message
          });
          await pool.query('UPDATE endpoints SET last_error = $1 WHERE endpoint_id = $2', [err.message, endpoint.endpoint_id]);
          return null;
        }
      })
    );

    const filteredResults = results.filter(r => r !== null);
    await setCache(cacheKey, filteredResults);
    logger.info('Price comparison completed', { type, result_count: filteredResults.length });
    res.json({ cached: false, data: filteredResults });
  } catch (err) {
    logger.error('Price comparison failed', { type, Lat, Long, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Delete Provider and Its Endpoints
router.delete('/delete-provider/:providerId', async (req, res) => {
  const { providerId } = req.params;

  try {
    logger.info('Deleting provider and its endpoints', { provider_id: providerId });

    const endpointResult = await pool.query('DELETE FROM endpoints WHERE provider_id = $1 RETURNING endpoint_id', [providerId]);
    const deletedEndpoints = endpointResult.rows.map(row => row.endpoint_id);

    const providerResult = await pool.query('DELETE FROM providers WHERE provider_id = $1 RETURNING provider_id', [providerId]);
    if (providerResult.rows.length === 0) {
      logger.warn('Provider not found for deletion', { provider_id: providerId });
      return res.status(404).json({ error: 'Provider not found' });
    }

    logger.info('Provider and endpoints deleted successfully', {
      provider_id: providerId,
      deleted_endpoints: deletedEndpoints
    });
    res.json({ message: 'Provider and its endpoints deleted', provider_id: providerId, deleted_endpoints: deletedEndpoints });
  } catch (err) {
    logger.error('Delete provider failed', { provider_id: providerId, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;