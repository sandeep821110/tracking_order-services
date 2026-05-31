import amqp from "amqplib";

let channel = null;
let connection = null;
let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRY_ATTEMPTS = 5;

/**
 * Connect to RabbitMQ with Advanced Retry Logic
 */
export const connectRabbitMQ = async (attemptNumber = 1) => {
  try {
    const rabbitMQURL = process.env.RABBITMQ_URL || "amqp://localhost:5672";

    if (!process.env.RABBITMQ_URL) {
      console.warn("⚠️  RABBITMQ_URL not set - Using default: amqp://localhost:5672");
    }

    console.log(`🔄 Connecting to RabbitMQ (attempt ${attemptNumber}/${MAX_RETRY_ATTEMPTS})...`);

    // Create connection with timeout
    const connectionPromise = amqp.connect(rabbitMQURL, {
      connectionTimeout: attemptNumber === 1 ? 5000 : 3000,
      frameMax: 0,
      heartbeat: 60,
      vhost: "/",
    });

    // Race connection against timeout
    connection = await Promise.race([
      connectionPromise,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Connection timeout after ${5000}ms`)),
          attemptNumber === 1 ? 6000 : 4000
        )
      ),
    ]);

    console.log("✅ RabbitMQ Connection Established");

    // Create channel
    channel = await connection.createChannel();
    console.log("✅ RabbitMQ Channel Created");

    // Declare queue
    await channel.assertQueue("order_created", {
      durable: true,
    });
    console.log("✅ RabbitMQ Queue 'order_created' ready");

    // Set up error handlers on connection
    connection.on("error", (err) => {
      isConnected = false;
      
      if (err.message.includes("ECONNREFUSED")) {
        console.warn("⚠️  RabbitMQ: Connection refused - Is RabbitMQ running on localhost:5672?");
      } else if (err.message.includes("ENOTFOUND")) {
        console.warn("⚠️  RabbitMQ: Host not found - Check RABBITMQ_URL in .env");
      } else if (err.message.includes("403") || err.message.includes("401")) {
        console.warn("⚠️  RabbitMQ: Authentication failed - Check username and password");
      } else {
        console.warn(`⚠️  RabbitMQ Connection Error: ${err.message}`);
      }
      
      // Auto-reconnect after delay
      if (attemptNumber < MAX_RETRY_ATTEMPTS) {
        const delay = Math.min(attemptNumber * 2000, 10000);
        console.log(`🔄 RabbitMQ: Will retry in ${delay}ms...`);
        setTimeout(() => {
          connectRabbitMQ(attemptNumber + 1);
        }, delay);
      } else {
        console.warn("❌ RabbitMQ: Max retry attempts reached. Message queue unavailable.");
        console.log("📝 Service will work without message queue functionality");
      }
    });

    connection.on("close", () => {
      isConnected = false;
      console.warn("⚠️  RabbitMQ Connection Closed - Will attempt to reconnect...");
      
      // Attempt reconnection
      setTimeout(() => {
        connectRabbitMQ(1);
      }, 5000);
    });

    isConnected = true;
    connectionAttempts = 0;
    console.log("✅ RabbitMQ Ready - Message queue is operational");

  } catch (error) {
    isConnected = false;
    connectionAttempts = attemptNumber;

    // Provide specific error guidance
    let errorGuide = "";
    if (error.message.includes("ECONNREFUSED")) {
      errorGuide = "\n📍 Fix: Start RabbitMQ with: rabbitmq-server";
    } else if (error.message.includes("ENOTFOUND")) {
      errorGuide = "\n📍 Fix: Check RABBITMQ_URL in .env file";
    } else if (error.message.includes("timeout")) {
      errorGuide = "\n📍 Fix: Check network connectivity to RabbitMQ server";
    } else if (error.message.includes("403") || error.message.includes("401")) {
      errorGuide = "\n📍 Fix: Verify username and password in RABBITMQ_URL";
    }

    console.warn(`⚠️  RabbitMQ Connection Failed (attempt ${attemptNumber}/${MAX_RETRY_ATTEMPTS}): ${error.message}${errorGuide}`);

    // Retry with exponential backoff
    if (attemptNumber < MAX_RETRY_ATTEMPTS) {
      const delay = Math.min(attemptNumber * 2000, 10000);
      console.log(`🔄 RabbitMQ: Retrying in ${delay}ms...`);
      setTimeout(() => {
        connectRabbitMQ(attemptNumber + 1);
      }, delay);
    } else {
      console.warn("❌ RabbitMQ: Max retry attempts reached");
      console.log("📝 Service will work without message queue functionality");
      channel = null;
      connection = null;
    }
  }
};

/**
 * Get RabbitMQ channel
 */
export const getChannel = () => channel;

/**
 * Get connection object
 */
export const getConnection = () => connection;

/**
 * Check if RabbitMQ is connected
 */
export const isRabbitMQConnected = () => isConnected && channel !== null;

/**
 * Get RabbitMQ connection status
 */
export const getRabbitMQStatus = () => ({
  connected: isConnected,
  available: isRabbitMQConnected(),
  attempts: connectionAttempts,
  hasConnection: connection !== null,
  hasChannel: channel !== null,
});

/**
 * Check RabbitMQ health by creating temporary queue
 */
export const checkRabbitMQHealth = async () => {
  if (!isRabbitMQConnected()) {
    return {
      status: "disconnected",
      message: "RabbitMQ not connected",
      connected: false,
    };
  }

  try {
    const healthQueue = `health-check-${Date.now()}`;
    await channel.assertQueue(healthQueue, { exclusive: true });
    await channel.deleteQueue(healthQueue);
    return {
      status: "healthy",
      message: "RabbitMQ is operational",
      connected: true,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      message: error.message,
      connected: isConnected,
    };
  }
};

/**
 * Send message to queue
 */
export const publishToQueue = async (queueName, message) => {
  if (!isRabbitMQConnected()) {
    console.warn(`⚠️  RabbitMQ: Not connected. Cannot publish to ${queueName}`);
    return false;
  }

  try {
    const success = channel.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );

    if (!success) {
      console.warn(`⚠️  RabbitMQ: Queue buffer full for ${queueName}`);
      // Channel is blocked, wait a bit before retry
      await new Promise(resolve => setTimeout(resolve, 100));
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`RabbitMQ Publish Error to ${queueName}:`, error.message);
    return false;
  }
};

/**
 * Subscribe to queue
 */
export const subscribeToQueue = async (queueName, callback) => {
  if (!isRabbitMQConnected()) {
    console.warn(`⚠️  RabbitMQ: Not connected. Cannot subscribe to ${queueName}`);
    return false;
  }

  try {
    await channel.consume(
      queueName,
      (msg) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            callback(null, content);
            channel.ack(msg);
          } catch (error) {
            console.error(`Error processing message from ${queueName}:`, error);
            channel.nack(msg, false, true); // Requeue on error
          }
        }
      },
      { noAck: false }
    );

    console.log(`✅ Subscribed to queue: ${queueName}`);
    return true;
  } catch (error) {
    console.warn(`RabbitMQ Subscribe Error for ${queueName}:`, error.message);
    return false;
  }
};

export default {
  connectRabbitMQ,
  getChannel,
  getConnection,
  isRabbitMQConnected,
  getRabbitMQStatus,
  publishToQueue,
  subscribeToQueue,
  checkRabbitMQHealth,
};