import { configDotenv } from "dotenv";
configDotenv();

import app from "./src/app.js";
import mongoose from "mongoose";
import connectDB from "./src/config/db.js";
import { connectRabbitMQ, isRabbitMQConnected, getChannel, getConnection as getRabbitConnection } from "./src/config/rabbitmq.js";
import { getRedis } from "./src/config/redis.js";

const PORT = process.env.PORT || 2010;
const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * Initialize and start the server
 */
const startServer = async () => {
  try {
    // Connect to MongoDB (required)
    console.log("🔌 Connecting to MongoDB...");
    await connectDB();

    // Connect to RabbitMQ (optional - service works without it)
    console.log("🔌 Connecting to RabbitMQ...");
    await connectRabbitMQ();
    if (!isRabbitMQConnected()) {
      console.log("⚠️  RabbitMQ not connected - continuing without message queue");
    }

    // Redis connection handled automatically via config/redis.js
    console.log("🔌 Redis connection initializing...");

    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════╗
║   Order Tracking Service Started       ║
╠════════════════════════════════════════╣
║  Port:        ${PORT.toString().padEnd(29)}║
║  Environment: ${NODE_ENV.padEnd(28)}║
║  Time:        ${new Date().toISOString().slice(0, 19).padEnd(23)}║
╚════════════════════════════════════════╝
      `);
    });

    // Handle server errors
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error("❌ Server error:", error);
      }
      process.exit(1);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 ${signal} received — shutting down gracefully...`);
      server.close(async () => {
        console.log("✅ HTTP server closed");
        try { await mongoose.disconnect(); console.log("✅ MongoDB disconnected"); } catch (e) { /* ignore */ }
        try { const ch = getChannel(); if (ch) await ch.close(); const conn = getRabbitConnection(); if (conn) await conn.close(); console.log("✅ RabbitMQ disconnected"); } catch (e) { /* ignore */ }
        try { const r = getRedis(); if (r) { r.quit(); } console.log("✅ Redis disconnected"); } catch (e) { /* ignore */ }
        process.exit(0);
      });
      setTimeout(() => { console.error("❌ Forced shutdown after timeout"); process.exit(1); }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

// Start the server
startServer();

// Global process-level handlers to capture unexpected errors and rejections
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err && err.stack ? err.stack : err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason && reason.stack ? reason.stack : reason);
  process.exit(1);
});
