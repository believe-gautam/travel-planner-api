const { Pool } = require('pg');
const logger = require('../logger/logger');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS providers (
        provider_id SERIAL PRIMARY KEY,
        provider_name VARCHAR(255) NOT NULL,
        api_key VARCHAR(255),
        base_url VARCHAR(255) NOT NULL,
        auth_details JSONB,
        rate_limit INT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS endpoints (
        endpoint_id SERIAL PRIMARY KEY,
        provider_id INT REFERENCES providers(provider_id),
        type VARCHAR(50) NOT NULL,
        endpoint VARCHAR(255) NOT NULL,
        http_method VARCHAR(10) NOT NULL,
        parameters JSONB,
        response_mapping JSONB,
        test_payload JSONB,
        status VARCHAR(20) DEFAULT 'active',
        priority INT DEFAULT 1,
        last_error TEXT
      );
    `);
    logger.info('Database initialized successfully');
  } catch (err) {
    logger.error('Database initialization failed', { error: err.message });
    throw err;
  }
};

module.exports = { pool, initDb };