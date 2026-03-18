const env = require('./config/env');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agents');
const callRoutes = require('./routes/calls');
const setupSocketIO = require('./socket');
const heartbeat = require('./utils/heartbeat');
const agentService = require('./services/agentService');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);

// Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: env.corsOrigins.concat(['*']),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.corsOrigins.concat(['*']), credentials: true }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/calls', callRoutes);

// Serve widget files with permissive CORS
app.use('/widget', express.static(path.join(__dirname, '../../widget'), {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=3600');
  },
}));

// Serve admin panel (for single-service deployment)
app.use('/admin', express.static(path.join(__dirname, '../../admin')));

// Initialize Socket.IO
setupSocketIO(io);

// Start heartbeat checker
heartbeat.start(io);

// Reset all agent statuses on server start
agentService.resetAllOnlineStatus().then(() => {
  logger.info('Reset all agent online statuses');
});

// Run migrations on startup (production)
if (env.nodeEnv === 'production') {
  const fs = require('fs');
  const pool = require('./config/database');
  const migrationsDir = path.join(__dirname, 'db/migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  (async () => {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await pool.query(sql);
        logger.info(`Migration applied: ${file}`);
      } catch (err) {
        // Ignore "already exists" errors from IF NOT EXISTS
        if (!err.message.includes('already exists')) {
          logger.error(`Migration error in ${file}:`, err);
        }
      }
    }
  })();
}

server.listen(env.port, () => {
  logger.info(`WebCall server running on port ${env.port}`);
  logger.info(`Environment: ${env.nodeEnv}`);
  logger.info(`CORS origins: ${env.corsOrigins.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  heartbeat.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
