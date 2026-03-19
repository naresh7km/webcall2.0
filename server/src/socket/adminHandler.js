const agentService = require('../services/agentService');
const callManager = require('./callManager');
const logger = require('../utils/logger');

module.exports = function adminHandler(socket) {
  const agentId = socket.agentId;
  const agentRole = socket.agentRole;

  logger.info(`Agent connected: ${agentId} (role: ${agentRole})`);

  // Register socket in call manager
  callManager.registerAgentSocket(agentId, socket);

  // Mark agent online
  agentService.setOnline(agentId, true).then(() => {
    callManager.broadcastAgentStatus(socket);
  });

  // Heartbeat
  socket.on('agent:heartbeat', async () => {
    try {
      await agentService.updateHeartbeat(agentId);
      socket.emit('agent:heartbeat-ack');
    } catch (err) {
      logger.error('Heartbeat error:', err);
    }
  });

  // Visibility change
  socket.on('agent:visibility-change', async ({ visible }) => {
    try {
      await agentService.setOnline(agentId, visible);
      if (visible) {
        await agentService.updateHeartbeat(agentId);
      }
      callManager.broadcastAgentStatus(socket);
    } catch (err) {
      logger.error('Visibility change error:', err);
    }
  });

  // Availability toggle
  socket.on('agent:set-available', async ({ available }) => {
    try {
      await agentService.setAvailable(agentId, available);
      callManager.broadcastAgentStatus(socket);
    } catch (err) {
      logger.error('Set available error:', err);
    }
  });

  // Call accept
  socket.on('call:accept', async ({ callId }) => {
    try {
      await callManager.acceptCall(callId, agentId);
    } catch (err) {
      logger.error('Call accept error:', err);
    }
  });

  // Call reject
  socket.on('call:reject', async ({ callId }) => {
    try {
      await callManager.rejectCall(callId, agentId);
    } catch (err) {
      logger.error('Call reject error:', err);
    }
  });

  // Call hangup (agent side)
  socket.on('call:hangup', async ({ callId }) => {
    try {
      await callManager.endCall(callId, 'agent_hangup');
    } catch (err) {
      logger.error('Call hangup error:', err);
    }
  });

  // WebRTC signaling - relay to caller
  socket.on('webrtc:answer', ({ callId, sdp }) => {
    callManager.relayToCaller(callId, 'webrtc:answer', { sdp });
  });

  socket.on('webrtc:ice-candidate', ({ callId, candidate }) => {
    callManager.relayToCaller(callId, 'webrtc:ice-candidate', { candidate });
  });

  // Get agent list - available to all roles so agents can see who's online
  socket.on('admin:get-agents', async () => {
    try {
      const agents = await agentService.getAll();
      socket.emit('admin:agents-list', { agents });
    } catch (err) {
      logger.error('Get agents error:', err);
    }
  });

  // Admin-only: set priority
  if (agentRole === 'admin') {
    socket.on('admin:set-priority', async ({ agentId: targetId, priority }) => {
      try {
        await agentService.setPriority(targetId, priority);
        callManager.broadcastAgentStatus(socket);
      } catch (err) {
        logger.error('Set priority error:', err);
      }
    });
  }

  // Disconnect
  socket.on('disconnect', async () => {
    logger.info(`Agent disconnected: ${agentId}`);
    callManager.unregisterAgentSocket(agentId);
    try {
      await agentService.setOnline(agentId, false);
      await agentService.setBusy(agentId, false);
      // Broadcast to remaining admin sockets
      const agents = await agentService.getAll();
      socket.nsp.emit('agents:status-update', { agents });
    } catch (err) {
      logger.error('Disconnect cleanup error:', err);
    }
  });
};
