const { v4: uuidv4 } = require('uuid');
const agentService = require('../services/agentService');
const callService = require('../services/callService');
const logger = require('../utils/logger');

const RING_TIMEOUT_MS = 20000;

class CallManager {
  constructor() {
    this.activeCalls = new Map();    // callId -> CallState
    this.agentSockets = new Map();   // agentId -> socket
    this.callerSockets = new Map();  // callId -> callerSocket
  }

  registerAgentSocket(agentId, socket) {
    this.agentSockets.set(agentId, socket);
  }

  unregisterAgentSocket(agentId) {
    this.agentSockets.delete(agentId);

    // End any active call this agent was on
    for (const [callId, call] of this.activeCalls) {
      if (call.agentId === agentId) {
        this.endCall(callId, 'agent_disconnected');
      }
    }
  }

  unregisterCallerSocket(socketId) {
    for (const [callId, call] of this.activeCalls) {
      if (call.callerSocketId === socketId) {
        if (call.status === 'ringing' || call.status === 'queued') {
          this.abandonCall(callId);
        } else {
          this.endCall(callId, 'caller_disconnected');
        }
      }
    }
  }

  async initiateCall(callerSocket, metadata) {
    const callId = uuidv4();
    const dbCall = await callService.createCall(callerSocket.id, metadata);

    const callState = {
      callId: dbCall.id,
      callerSocketId: callerSocket.id,
      callerSocket,
      agentId: null,
      agentSocket: null,
      status: 'queued',
      attemptedAgents: [],
      ringTimeout: null,
      answeredAt: null,
    };

    this.activeCalls.set(dbCall.id, callState);
    this.callerSockets.set(dbCall.id, callerSocket);

    callerSocket.emit('call:queued', { callId: dbCall.id });

    await this.routeToNextAgent(dbCall.id);
    return dbCall.id;
  }

  async routeToNextAgent(callId) {
    const call = this.activeCalls.get(callId);
    if (!call || call.status === 'active' || call.status === 'ended') return;

    const availableAgents = await agentService.getAvailableAgents();
    logger.info(`Call ${callId}: available agents from DB: ${availableAgents.map(a => a.id).join(', ') || 'none'}`);
    logger.info(`Call ${callId}: registered agent sockets: ${[...this.agentSockets.keys()].join(', ') || 'none'}`);
    const candidates = availableAgents.filter(a => !call.attemptedAgents.includes(a.id));
    logger.info(`Call ${callId}: candidates after filtering attempted: ${candidates.map(a => a.id).join(', ') || 'none'}`);

    if (candidates.length === 0) {
      // No agents left to try
      call.callerSocket.emit('call:rejected', {
        callId,
        reason: call.attemptedAgents.length === 0 ? 'no_agents_available' : 'no_agents_accepted',
      });
      await callService.updateCallStatus(callId, 'missed', { endReason: 'no_agents_available' });
      this.activeCalls.delete(callId);
      this.callerSockets.delete(callId);
      return;
    }

    const agent = candidates[0];
    call.attemptedAgents.push(agent.id);
    call.status = 'ringing';

    const agentSocket = this.agentSockets.get(agent.id);
    if (!agentSocket) {
      // Agent socket not connected, try next
      return this.routeToNextAgent(callId);
    }

    await callService.updateCallStatus(callId, 'ringing', { agentId: agent.id });

    // Notify caller
    call.callerSocket.emit('call:ringing', { callId, agentName: agent.display_name });

    // Notify agent
    agentSocket.emit('call:incoming', {
      callId,
      callerId: call.callerSocketId,
      metadata: {},
      timeout: RING_TIMEOUT_MS / 1000,
    });

    // Start timeout
    call.ringTimeout = setTimeout(() => {
      logger.info(`Ring timeout for agent ${agent.id} on call ${callId}`);
      this.routeToNextAgent(callId);
    }, RING_TIMEOUT_MS);
  }

  async acceptCall(callId, agentId) {
    const call = this.activeCalls.get(callId);
    if (!call || call.status !== 'ringing') return false;

    clearTimeout(call.ringTimeout);

    const agentSocket = this.agentSockets.get(agentId);
    if (!agentSocket) return false;

    call.agentId = agentId;
    call.agentSocket = agentSocket;
    call.status = 'active';
    call.answeredAt = new Date();

    await agentService.setBusy(agentId, true);
    await callService.updateCallStatus(callId, 'active', {
      agentId,
      answeredAt: call.answeredAt,
    });

    // Tell both sides to begin WebRTC
    call.callerSocket.emit('call:answered', { callId });
    agentSocket.emit('call:connected', { callId });

    // Broadcast status update
    this.broadcastAgentStatus(agentSocket);

    logger.info(`Call ${callId} answered by agent ${agentId}`);
    return true;
  }

  async rejectCall(callId, agentId) {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    clearTimeout(call.ringTimeout);
    logger.info(`Call ${callId} rejected by agent ${agentId}`);

    await this.routeToNextAgent(callId);
  }

  async endCall(callId, reason) {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    clearTimeout(call.ringTimeout);

    const endedAt = new Date();
    const durationSec = call.answeredAt
      ? Math.round((endedAt - call.answeredAt) / 1000)
      : 0;

    call.status = 'ended';

    // Notify both sides
    if (call.callerSocket && call.callerSocket.connected) {
      call.callerSocket.emit('call:ended', { callId, reason });
    }
    if (call.agentSocket && call.agentSocket.connected) {
      call.agentSocket.emit('call:ended', { callId, reason });
    }

    // Update DB
    if (call.agentId) {
      await agentService.setBusy(call.agentId, false);
    }
    await callService.updateCallStatus(callId, 'completed', {
      endedAt,
      durationSec,
      endReason: reason,
    });

    this.activeCalls.delete(callId);
    this.callerSockets.delete(callId);

    if (call.agentSocket) {
      this.broadcastAgentStatus(call.agentSocket);
    }

    logger.info(`Call ${callId} ended: ${reason} (${durationSec}s)`);
  }

  async abandonCall(callId) {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    clearTimeout(call.ringTimeout);

    // If an agent was being rung, notify them
    const lastAttempted = call.attemptedAgents[call.attemptedAgents.length - 1];
    if (lastAttempted) {
      const agentSocket = this.agentSockets.get(lastAttempted);
      if (agentSocket) {
        agentSocket.emit('call:ended', { callId, reason: 'caller_abandoned' });
      }
    }

    await callService.updateCallStatus(callId, 'abandoned', { endReason: 'caller_abandoned' });
    this.activeCalls.delete(callId);
    this.callerSockets.delete(callId);

    logger.info(`Call ${callId} abandoned by caller`);
  }

  // Relay WebRTC signaling
  relayToCaller(callId, event, data) {
    const call = this.activeCalls.get(callId);
    if (call && call.callerSocket && call.callerSocket.connected) {
      call.callerSocket.emit(event, { callId, ...data });
    }
  }

  relayToAgent(callId, event, data) {
    const call = this.activeCalls.get(callId);
    if (call && call.agentSocket && call.agentSocket.connected) {
      call.agentSocket.emit(event, { callId, ...data });
    }
  }

  async broadcastAgentStatus(socket) {
    try {
      const agents = await agentService.getAll();
      socket.nsp.emit('agents:status-update', { agents });
    } catch (err) {
      logger.error('Failed to broadcast agent status:', err);
    }
  }

  getCallByAgent(agentId) {
    for (const [callId, call] of this.activeCalls) {
      if (call.agentId === agentId && call.status === 'active') return call;
    }
    return null;
  }
}

module.exports = new CallManager();
