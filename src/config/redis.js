import Redis from "ioredis";
import { configDotenv } from "dotenv";
configDotenv();
let redis = null;
let isRedisConnected = false;
let connectionAttempts = 0;

/**
 * Initialize Redis Connection with Advanced Configuration
 */
const initializeRedis = () => {
  try {
    const redisURL = process.env.REDIS_URL;

    if (!redisURL) {
      console.warn("⚠️  REDIS_URL environment variable not set - Redis disabled");
      return null;
    }

    console.log("🔄 Connecting to Redis...");

    // Parse Redis URL to detect if it's local or cloud-based
    const isCloudRedis = redisURL.includes("@");

    // Create Redis connection with adaptive settings
    redis = new Redis(redisURL, {
      // Retry strategy with exponential backoff
      retryStrategy: (times) => {
        connectionAttempts = times;
        const delay = Math.min(times * 100, 3000);
        
        if (times > 10) {
          console.warn(`⚠️  Redis: Retry attempt ${times} failed. Giving up for now.`);
          return null; // Stop retrying
        }
        
        console.log(`🔄 Redis: Retrying connection (attempt ${times})...`);
        return delay;
      },

      // Connection settings
      connectTimeout: isCloudRedis ? 15000 : 5000, // Cloud needs more time
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      enableOfflineQueue: true,
      
      // Performance settings
      lazyConnect: false,
      keepAlive: 30000,
      
      // TLS for cloud Redis (if URL has tls scheme)
      ...(redisURL.startsWith("rediss://") && { tls: {} }),
    });

    // Connection event handlers
    redis.on("connect", () => {
      console.log("✅ Redis Connected Successfully");
      isRedisConnected = true;
      connectionAttempts = 0;
    });

    redis.on("ready", () => {
      console.log("✅ Redis Ready - Cache is operational");
    });

    redis.on("error", (err) => {
      isRedisConnected = false;
      
      // Provide specific error guidance
      if (err.message.includes("ECONNREFUSED")) {
        console.warn("⚠️  Redis: Connection refused - Is Redis running on localhost:6379?");
      } else if (err.message.includes("ENOTFOUND")) {
        console.warn("⚠️  Redis: Host not found - Check REDIS_URL in .env");
      } else if (err.message.includes("WRONGPASS") || err.message.includes("invalid password")) {
        console.warn("⚠️  Redis: Authentication failed - Check password in REDIS_URL");
      } else if (err.message.includes("AuthState")) {
        console.warn("⚠️  Redis: Authentication state error - Verify credentials");
      } else {
        console.warn(`⚠️  Redis Error: ${err.message}`);
      }
      console.log("📝 Service will work without caching");
    });

    redis.on("close", () => {
      isRedisConnected = false;
      console.log("⚠️  Redis Connection Closed");
    });

    redis.on("reconnecting", () => {
      console.log("🔄 Redis: Attempting to reconnect...");
    });

    return redis;
  } catch (error) {
    console.warn(`⚠️  Redis initialization error: ${error.message}`);
    return null;
  }
};

// Initialize Redis on import
redis = initializeRedis();

/**
 * Get Redis client (returns null if not connected)
 */
export const getRedis = () => redis;

/**
 * Check if Redis is connected
 */
export const isRedisAvailable = () => isRedisConnected && redis !== null;

/**
 * Get Redis connection status
 */
export const getRedisStatus = () => ({
  connected: isRedisConnected,
  available: isRedisAvailable(),
  attempts: connectionAttempts,
  status: redis?.status || "not_initialized"
});

/**
 * Redis utility: Safe get with error handling
 */
export const redisGet = async (key) => {
  if (!isRedisAvailable()) return null;
  try {
    const value = await Promise.race([
      redis.get(key),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Redis GET timeout")), 5000)
      )
    ]);
    return value;
  } catch (error) {
    console.warn(`Redis GET error for key "${key}":`, error.message);
    return null;
  }
};

/**
 * Redis utility: Safe set with error handling
 */
export const redisSet = async (key, value, ttl = 3600) => {
  if (!isRedisAvailable()) return false;
  try {
    await Promise.race([
      redis.setex(key, ttl, value),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Redis SET timeout")), 5000)
      )
    ]);
    return true;
  } catch (error) {
    console.warn(`Redis SET error for key "${key}":`, error.message);
    return false;
  }
};

/**
 * Redis utility: Safe delete
 */
export const redisDel = async (key) => {
  if (!isRedisAvailable()) return false;
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.warn(`Redis DEL error for key "${key}":`, error.message);
    return false;
  }
};

/**
 * Flush all Redis data (use with caution)
 */
export const redisFlush = async () => {
  if (!isRedisAvailable()) return false;
  try {
    await redis.flushall();
    console.log("✅ Redis cache cleared");
    return true;
  } catch (error) {
    console.warn("Redis FLUSH error:", error.message);
    return false;
  }
};

/**
 * Check Redis health
 */
export const checkRedisHealth = async () => {
  if (!redis) {
    return { status: "not_initialized", message: "Redis client not initialized" };
  }

  try {
    const pong = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Ping timeout")), 3000)
      )
    ]);
    return { status: "healthy", message: pong, connected: isRedisConnected };
  } catch (error) {
    return { status: "unhealthy", message: error.message, connected: isRedisConnected };
  }
};

export default redis;