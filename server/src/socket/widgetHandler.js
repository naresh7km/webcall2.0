const callManager = require('./callManager');
const logger = require('../utils/logger');

module.exports = function widgetHandler(socket) {
  logger.info(`Widget client connected: ${socket.id}`);

  // Initiate a call
  socket.on('call:initiate', async ({ metadata }) => {
    try {
      const callId = await callManager.initiateCall(socket, metadata || {});
      logger.info(`Call initiated: ${callId} from ${socket.id}`);
    } catch (err) {
      logger.error('Call initiate error:', err);
      socket.emit('call:rejected', { callId: null, reason: 'server_error' });
    }
  });

  // Caller hangup
  socket.on('call:hangup', async ({ callId }) => {
    try {
      await callManager.endCall(callId, 'caller_hangup');
    } catch (err) {
      logger.error('Caller hangup error:', err);
    }
  });

  // WebRTC signaling - relay to agent
  socket.on('webrtc:offer', ({ callId, sdp }) => {
    callManager.relayToAgent(callId, 'webrtc:offer', { sdp });
  });

  socket.on('webrtc:ice-candidate', ({ callId, candidate }) => {
    callManager.relayToAgent(callId, 'webrtc:ice-candidate', { candidate });
  });

  // Disconnect
  socket.on('disconnect', () => {
    logger.info(`Widget client disconnected: ${socket.id}`);
    callManager.unregisterCallerSocket(socket.id);
  });
};
