 
/** UnComment this line to active radis */
const redis = null; //process.env.REDIS_URL ? require('redis').createClient({ url: process.env.REDIS_URL }) : null;

const NodeCache = require('node-cache');
const nodeCache = new NodeCache();

redis?.on('error', (err) => console.log('Redis Error:', err));

const getCache = async (key) => {
  if (redis) {
    const result = await redis.get(key);
    return result ? JSON.parse(result) : null;
  }
  return nodeCache.get(key);
};

const setCache = async (key, value, ttl = 600) => {
  if (redis) {
    await redis.setEx(key, ttl, JSON.stringify(value));
  } else {
    nodeCache.set(key, value, ttl);
  }
};

const delCache = async (key) => {
  if (redis) await redis.del(key);
  else nodeCache.del(key);
};

module.exports = { getCache, setCache, delCache };