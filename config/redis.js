const redis = require("redis");

let redisClient;
let isRedisAvailable = false;

const connectToRedis = async () => {
  try {
    console.log("Attempting to connect to Redis...");
    redisClient = redis.createClient();
    redisClient.on("error", (err) => {
      isRedisAvailable = false;
      redisClient.disconnect();
      redisClient = null;
    });

    redisClient.on("connect", () => {
      console.log("Connected to Redis");
      connectingStatus = "connected";
    });

    redisClient.on("ready", () => {
      console.log("Redis client is ready");
      isRedisAvailable = true;
    });

    redisClient.on("end", () => {
      console.warn("Redis client disconnected");
      isRedisAvailable = false;
    });

    await redisClient.connect();
    isRedisAvailable = true;
  } catch (error) {
    console.warn("Error connecting to Redis:", error.message);
    redisClient = null;
    isRedisAvailable = false;
  }
};
connectToRedis();
module.exports = {
  getCache: async (key) => {
    if (!isRedisAvailable || !redisClient) return null;
    try {
      console.log("getting cache:", key);
      return await redisClient.get(key);
    } catch (error) {
      console.warn("Error getting cache:", error);
      return null;
    }
  },
  setCache: async (key, value) => {
    console.log(isRedisAvailable, redisClient);
    if (!isRedisAvailable || !redisClient) return;
    try {
      console.log("setting cache:", key);
      await redisClient.set(key, JSON.stringify(value));
    } catch (error) {
      console.warn("Error setting cache:", error);
    }
  },
  clearCache: async () => {
    if (!isRedisAvailable || !redisClient) {
      console.warn("Redis not available. Cannot clear cache.");
      return;
    }
    try {
      await redisClient.flushAll();
      console.log("All Redis cache cleared.");
    } catch (error) {
      console.warn("Error clearing Redis cache:", error);
    }
  },
  connectToRedis,
};
