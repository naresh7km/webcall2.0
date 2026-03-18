const agentService = require('../services/agentService');
const logger = require('./logger');

let interval = null;

function start(io) {
  interval = setInterval(async () => {
    try {
      const staleIds = await agentService.markStaleAgentsOffline();
      if (staleIds.length > 0) {
        logger.info(`Marked ${staleIds.length} stale agent(s) offline:`, staleIds);
        // Broadcast updated agent list to admin namespace
        const agents = await agentService.getAll();
        io.of('/admin').emit('agents:status-update', { agents });
      }
    } catch (err) {
      logger.error('Heartbeat checker error:', err);
    }
  }, 10000);
}

function stop() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

module.exports = { start, stop };
