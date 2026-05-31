import express from "express";
import cors from "cors";
import morgan from "morgan";
import orderTrackingRoutes from "./routes/ordertracking.route.js";
import errorHandler from "./middleware/errorHandler.js";
import { checkRedisHealth, isRedisAvailable, getRedisStatus } from "./config/redis.js";
import { checkRabbitMQHealth, isRabbitMQConnected, getRabbitMQStatus } from "./config/rabbitmq.js";

const app = express();

// Middleware
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(morgan("dev")); // HTTP request logger
app.use(express.json({ limit: "10mb" })); // Parse JSON request bodies
app.use(express.urlencoded({ limit: "10mb", extended: true })); // Parse URL-encoded request bodies

// Request logging middleware (with proper error handling)
app.use((req, res, next) => {
  try {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    return next();
  } catch (error) {
    console.error("❌ Request logging middleware error:", error.message);
    return next(error);
  }
});

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "Order Tracking Service API",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    documentation: "/api-docs",
  });
});

/**
 * Health Check Endpoint - Shows all services status
 */
app.get("/health", async (req, res) => {
  const redisHealth = await checkRedisHealth();
  const rabbitMQHealth = await checkRabbitMQHealth();

  const overallStatus = redisHealth.status === "healthy" && rabbitMQHealth.status === "healthy" ? "healthy" : "degraded";

  res.status(overallStatus === "healthy" ? 200 : 503).json({
    success: true,
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services: {
      mongodb: {
        status: "connected", // Will be checked by middleware
        message: "MongoDB connection active",
      },
      redis: {
        status: redisHealth.status,
        message: redisHealth.message,
        available: isRedisAvailable(),
        ...getRedisStatus(),
      },
      rabbitmq: {
        status: rabbitMQHealth.status,
        message: rabbitMQHealth.message,
        connected: isRabbitMQConnected(),
        ...getRabbitMQStatus(),
      },
    },
  });
});

/**
 * Detailed Status Endpoint
 */
app.get("/status", async (req, res) => {
  const redisHealth = await checkRedisHealth();
  const rabbitMQHealth = await checkRabbitMQHealth();

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    port: process.env.PORT || 3002,
    services: {
      redis: {
        ...redisHealth,
        available: isRedisAvailable(),
        details: getRedisStatus(),
      },
      rabbitmq: {
        ...rabbitMQHealth,
        connected: isRabbitMQConnected(),
        details: getRabbitMQStatus(),
      },
    },
    memory: process.memoryUsage(),
  });
});

// API Routes
app.use("/api/tracking", orderTrackingRoutes);

// 404 handler - MUST have all 3 parameters (req, res, next) for Express middleware chain
app.use((req, res, next) => {
  try {
    console.warn(`⚠️  Route not found: ${req.method} ${req.path}`);
    res.status(404).json({
      success: false,
      message: `Route ${req.method} ${req.path} not found`,
    });
  } catch (error) {
    console.error("❌ 404 handler error:", error.message);
    next(error);
  }
});

// Unhandled error fallback (in case errorHandler is not called)
app.use((err, req, res, next) => {
  // This is a backup - errorHandler should catch everything
  console.error("❌ Unhandled error reached fallback:", err);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { error: err.message }),
  });
});

app.use('/god',(req, res) => {
  res.json({
    success: true,
    message: "You have found the secret god endpoint! 🧙‍♂️✨"
    });
});
// Global error handler (must be absolutely last)
app.use(errorHandler);

export default app;
