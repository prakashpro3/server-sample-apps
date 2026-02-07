const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const amqplib = require('amqplib');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());


// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Simple logging function
const logToFile = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  const logFile = path.join(logsDir, 'app.log');
  fs.appendFileSync(logFile, logMessage);
  console.log(logMessage.trim());
};

// Request logging middleware
app.use((req, res, next) => {
  logToFile(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// ==================== SERVICE CONNECTIONS ====================

// --- Redis Configuration ---
let redis = null;
const REDIS_URL      = process.env.REDIS_URL || '';
const REDIS_HOST     = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT     = process.env.REDIS_PORT || 6379;
const REDIS_USERNAME = process.env.REDIS_USERNAME || '';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';

const connectRedis = async () => {
  try {
    const Redis = require('ioredis');

    // If REDIS_URL is set, use it directly; otherwise build from individual vars
    if (REDIS_URL) {
      redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
    } else {
      const redisOptions = {
        host: REDIS_HOST,
        port: REDIS_PORT,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      };
      if (REDIS_USERNAME) redisOptions.username = REDIS_USERNAME;
      if (REDIS_PASSWORD) redisOptions.password = REDIS_PASSWORD;
      redis = new Redis(redisOptions);
    }

    redis.on('connect', () => {
      logToFile('Connected to Redis successfully');
    });

    redis.on('error', (err) => {
      logToFile(`Redis connection error: ${err.message}`);
      redis = null;
    });
  } catch (error) {
    logToFile(`Redis not available: ${error.message}`);
    redis = null;
  }
};

// --- MongoDB Configuration ---
let mongoConnected = false;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/sample_app';

const connectMongo = async () => {
  try {
    await mongoose.connect(MONGO_URL);
    mongoConnected = true;
    logToFile('Connected to MongoDB successfully');
  } catch (error) {
    logToFile(`MongoDB not available: ${error.message}`);
    mongoConnected = false;
  }
};

// Mongoose User Model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// --- Message Queue (RabbitMQ) Configuration ---
let rabbitChannel = null;
let rabbitConnected = false;
const MSMQ_ENABLE   = (process.env.MSMQ_ENABLE || 'true').toLowerCase() === 'true';
const MSMQ_PROTOCOL = process.env.MSMQ_PROTOCOL || 'amqp';
const MSMQ_HOST     = process.env.MSMQ_HOST || 'localhost';
const MSMQ_PORT     = process.env.MSMQ_PORT || 5672;
const MSMQ_USERNAME = process.env.MSMQ_USERNAME || 'guest';
const MSMQ_PASSWORD = process.env.MSMQ_PASSWORD || 'guest';
const MSMQ_QUEUE    = process.env.MSMQ_QUEUE || 'task_queue';

// Build RabbitMQ URL from individual vars
const RABBITMQ_URL = `${MSMQ_PROTOCOL}://${MSMQ_USERNAME}:${MSMQ_PASSWORD}@${MSMQ_HOST}:${MSMQ_PORT}`;

const connectRabbitMQ = async () => {
  if (!MSMQ_ENABLE) {
    logToFile('RabbitMQ is disabled (MSMQ_ENABLE=false)');
    return;
  }

  try {
    const connection = await amqplib.connect(RABBITMQ_URL);
    rabbitChannel = await connection.createChannel();
    await rabbitChannel.assertQueue(MSMQ_QUEUE, { durable: true });
    rabbitConnected = true;
    logToFile('Connected to RabbitMQ successfully');

    connection.on('error', (err) => {
      logToFile(`RabbitMQ connection error: ${err.message}`);
      rabbitConnected = false;
      rabbitChannel = null;
    });

    connection.on('close', () => {
      logToFile('RabbitMQ connection closed');
      rabbitConnected = false;
      rabbitChannel = null;
    });
  } catch (error) {
    logToFile(`RabbitMQ not available: ${error.message}`);
    rabbitConnected = false;
    rabbitChannel = null;
  }
};

// Connect to all services
connectRedis();
connectMongo();
connectRabbitMQ();

// ==================== ROUTES ====================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      redis: redis ? 'connected' : 'not connected',
      mongodb: mongoConnected ? 'connected' : 'not connected',
      rabbitmq: rabbitConnected ? 'connected' : 'not connected'
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Sample Node.js API',
    version: '2.0.0',
    services: ['MongoDB', 'Redis', 'RabbitMQ'],
    endpoints: {
      health: 'GET /health',
      info: 'GET /info',
      users: 'GET /users',
      createUser: 'POST /users',
      getUser: 'GET /users/:id',
      counter: 'GET /counter',
      incrementCounter: 'POST /counter/increment',
      publishMessage: 'POST /queue/publish',
      queueStatus: 'GET /queue/status',
      logs: 'GET /logs'
    }
  });
});

// Server info endpoint
app.get('/info', (req, res) => {
  res.json({
    nodeVersion: process.version,
    platform: process.platform,
    memory: {
      total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
      used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
    },
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    services: {
      redis: redis ? 'connected' : 'not connected',
      mongodb: mongoConnected ? 'connected' : 'not connected',
      rabbitmq: rabbitConnected ? 'connected' : 'not connected'
    }
  });
});

// ==================== USERS (MongoDB) ====================

// In-memory fallback if MongoDB is not available
let inMemoryUsers = [
  { id: 1, name: 'John Doe', email: 'john@example.com' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
];

// Get all users
app.get('/users', async (req, res) => {
  try {
    if (mongoConnected) {
      const users = await User.find().sort({ createdAt: -1 });
      return res.json({ success: true, count: users.length, storage: 'mongodb', data: users });
    }
    res.json({ success: true, count: inMemoryUsers.length, storage: 'memory', data: inMemoryUsers });
  } catch (error) {
    logToFile(`Error fetching users: ${error.message}`);
    res.json({ success: true, count: inMemoryUsers.length, storage: 'memory', data: inMemoryUsers });
  }
});

// Create a new user
app.post('/users', async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email are required' });
  }

  try {
    if (mongoConnected) {
      const newUser = await User.create({ name, email });
      logToFile(`New user created in MongoDB: ${name} (${email})`);

      // Publish event to RabbitMQ if available
      if (rabbitChannel) {
        const message = JSON.stringify({ event: 'user_created', data: { name, email }, timestamp: new Date().toISOString() });
        rabbitChannel.sendToQueue(MSMQ_QUEUE, Buffer.from(message), { persistent: true });
        logToFile(`Event published to RabbitMQ: user_created for ${name}`);
      }

      return res.status(201).json({ success: true, storage: 'mongodb', data: newUser });
    }

    // Fallback to in-memory
    const newUser = { id: inMemoryUsers.length + 1, name, email };
    inMemoryUsers.push(newUser);
    logToFile(`New user created in memory: ${name} (${email})`);
    res.status(201).json({ success: true, storage: 'memory', data: newUser });
  } catch (error) {
    logToFile(`Error creating user: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

// Get a specific user
app.get('/users/:id', async (req, res) => {
  try {
    if (mongoConnected) {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });
      return res.json({ success: true, storage: 'mongodb', data: user });
    }

    const user = inMemoryUsers.find(u => u.id === parseInt(req.params.id));
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, storage: 'memory', data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});

// ==================== COUNTER (Redis) ====================

// Counter endpoint (demonstrates Redis usage)
app.get('/counter', async (req, res) => {
  let count = 0;

  if (redis) {
    try {
      count = await redis.get('api_counter') || 0;
    } catch (error) {
      logToFile(`Redis error: ${error.message}`);
    }
  }

  res.json({
    success: true,
    counter: parseInt(count),
    storage: redis ? 'redis' : 'not available'
  });
});

// Increment counter
app.post('/counter/increment', async (req, res) => {
  let count = 0;

  if (redis) {
    try {
      count = await redis.incr('api_counter');
      logToFile(`Counter incremented to ${count} (Redis)`);
    } catch (error) {
      logToFile(`Redis error: ${error.message}`);
    }
  } else {
    return res.json({ success: false, counter: 0, storage: 'not available', error: 'Redis not connected' });
  }

  res.json({
    success: true,
    counter: count,
    storage: 'redis'
  });
});

// ==================== QUEUE (RabbitMQ) ====================

// Publish a message to the queue
app.post('/queue/publish', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }

  if (!rabbitChannel) {
    return res.json({ success: false, error: 'RabbitMQ not connected' });
  }

  try {
    const payload = JSON.stringify({ event: 'custom_message', data: message, timestamp: new Date().toISOString() });
    rabbitChannel.sendToQueue(MSMQ_QUEUE, Buffer.from(payload), { persistent: true });
    logToFile(`Message published to RabbitMQ queue "${MSMQ_QUEUE}": ${message}`);
    res.json({ success: true, queue: MSMQ_QUEUE, message: 'Message published successfully' });
  } catch (error) {
    logToFile(`RabbitMQ publish error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to publish message' });
  }
});

// Get queue status
app.get('/queue/status', async (req, res) => {
  if (!rabbitChannel) {
    return res.json({ success: true, rabbitmq: 'not connected', queue: MSMQ_QUEUE, messageCount: 0 });
  }

  try {
    const queueInfo = await rabbitChannel.checkQueue(MSMQ_QUEUE);
    res.json({
      success: true,
      rabbitmq: 'connected',
      queue: MSMQ_QUEUE,
      messageCount: queueInfo.messageCount,
      consumerCount: queueInfo.consumerCount
    });
  } catch (error) {
    res.json({ success: true, rabbitmq: 'connected', queue: MSMQ_QUEUE, error: error.message });
  }
});

// ==================== LOGS ====================

// View recent logs
app.get('/logs', (req, res) => {
  const logFile = path.join(logsDir, 'app.log');

  try {
    if (fs.existsSync(logFile)) {
      const logs = fs.readFileSync(logFile, 'utf8');
      const lines = logs.split('\n').filter(line => line.trim());
      const recentLogs = lines.slice(-50);

      res.json({ success: true, count: recentLogs.length, logs: recentLogs });
    } else {
      res.json({ success: true, count: 0, logs: [] });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to read logs' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  logToFile(`Error: ${err.message}`);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logToFile(`Server started on port ${PORT}`);
  console.log(`
  ========================================
   Sample Node.js API Server v2.0
  ========================================
   Status:  Running
   Port:    ${PORT}
   Health:  http://localhost:${PORT}/health
  ========================================
   Services:
   - MongoDB : ${MONGO_URL}
   - Redis   : ${REDIS_HOST}:${REDIS_PORT}
   - RabbitMQ: ${MSMQ_HOST}:${MSMQ_PORT} (enabled: ${MSMQ_ENABLE})
  ========================================

  TASK: Create a Dockerfile for this app!

  Requirements:
  - Use node:18-alpine as base image
  - Set WORKDIR to /app
  - Copy package*.json first
  - Run npm install
  - Copy all source files
  - Expose port ${PORT}
  - Use CMD to start the server
  ========================================
  `);
});
