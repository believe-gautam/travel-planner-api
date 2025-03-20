const redis = process.env.REDIS_URL ? require('redis').createClient({ url: process.env.REDIS_URL }) : null;
const NodeCache = require('node-cache');
const logger = require('../logger/logger');

const nodeCache = new NodeCache();

redis?.on('error', (err) => logger.error('Redis connection error', { error: err.message }));

const getCache = async (key) => {
  if (redis) {
    try {
      const result = await redis.get(key);
      if (result) logger.info('Cache hit (Redis)', { key });
      else logger.info('Cache miss (Redis)', { key });
      return result ? JSON.parse(result) : null;
    } catch (err) {
      logger.error('Redis get failed', { key, error: err.message });
      return null;
    }
  }
  const result = nodeCache.get(key);
  if (result) logger.info('Cache hit (Node-cache)', { key });
  else logger.info('Cache miss (Node-cache)', { key });
  return result;
};

const setCache = async (key, value, ttl = 600) => {
  if (redis) {
    try {
      await redis.setEx(key, ttl, JSON.stringify(value));
      logger.info('Cache set (Redis)', { key, ttl });
    } catch (err) {
      logger.error('Redis set failed', { key, error: err.message });
    }
  } else {
    nodeCache.set(key, value, ttl);
    logger.info('Cache set (Node-cache)', { key, ttl });
  }
};

const delCache = async (key) => {
  if (redis) {
    try {
      await redis.del(key);
      logger.info('Cache deleted (Redis)', { key });
    } catch (err) {
      logger.error('Redis delete failed', { key, error: err.message });
    }
  } else {
    nodeCache.del(key);
    logger.info('Cache deleted (Node-cache)', { key });
  }
};

module.exports = { getCache, setCache, delCache };