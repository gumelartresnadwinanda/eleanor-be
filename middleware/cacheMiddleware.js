const { getCache, setCache } = require("../config/redis");

async function cacheMiddleware(req, res, next) {
  const cacheKey = req.originalUrl;
  const isAuthenticated = req.isAuthenticated;
  let cachePrefix = "guest:";
  if (isAuthenticated) {
    const token = req.cookies[process.env.COOKIE_NAME];
    cachePrefix = `user:${token}:`;
  }
  const finalCacheKey = cachePrefix + cacheKey;
  try {
    const cachedData = await getCache(finalCacheKey);
    if (cachedData) {
      res.status(200).json(JSON.parse(cachedData));
    } else {
      res.sendResponse = res.json;
      res.json = async (body) => {
        await setCache(finalCacheKey, body);
        res.sendResponse(body);
      };
      next();
    }
  } catch (error) {
    console.warn(`Cache error for ${finalCacheKey}:`, error);
    next();
  }
}

module.exports = cacheMiddleware;
