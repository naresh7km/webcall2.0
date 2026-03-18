const authService = require('../services/authService');
const agentService = require('../services/agentService');
const adminHandler = require('./adminHandler');
const widgetHandler = require('./widgetHandler');
const logger = require('../utils/logger');

module.exports = function setupSocketIO(io) {
  // Widget namespace - public, no auth required
  const widgetNsp = io.of('/widget');
  widgetNsp.on('connection', widgetHandler);

  // Admin namespace - requires JWT auth
  const adminNsp = io.of('/admin');

  adminNsp.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = authService.verifyAccessToken(token);
      const agent = await agentService.findById(payload.agentId);
      if (!agent) {
        return next(new Error('Agent not found'));
      }

      socket.agentId = agent.id;
      socket.agentRole = agent.role;
      socket.agentName = agent.display_name;
      next();
    } catch (err) {
      logger.warn('Socket auth failed:', err.message);
      next(new Error('Invalid or expired token'));
    }
  });

  adminNsp.on('connection', adminHandler);

  logger.info('Socket.IO namespaces initialized: /widget, /admin');
};
