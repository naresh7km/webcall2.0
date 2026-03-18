window.CallsPanel = (function() {
  let currentCallId = null;
  let callTimerInterval = null;
  let callStartTime = null;
  let ringTimerInterval = null;
  let ringtoneAudio = null;

  function init() {
    const socket = SocketManager.getSocket();
    if (!socket) return;

    // Incoming call
    socket.on('call:incoming', handleIncomingCall);

    // Call connected - start WebRTC
    socket.on('call:connected', handleCallConnected);

    // WebRTC offer from caller
    socket.on('webrtc:offer', ({ callId, sdp }) => {
      WebRTCManager.handleOffer(callId, sdp);
    });

    // ICE candidates
    socket.on('webrtc:ice-candidate', ({ candidate }) => {
      WebRTCManager.addIceCandidate(candidate);
    });

    // Call ended
    socket.on('call:ended', handleCallEnded);

    // Button handlers
    document.getElementById('call-accept-btn').addEventListener('click', acceptCall);
    document.getElementById('call-reject-btn').addEventListener('click', rejectCall);
    document.getElementById('call-hangup-btn').addEventListener('click', hangupCall);

    // Load call logs
    loadCallLogs();
  }

  function handleIncomingCall({ callId, callerId, timeout }) {
    currentCallId = callId;

    // Show notification
    const notification = document.getElementById('call-notification');
    notification.style.display = 'block';
    document.getElementById('call-notification-detail').textContent = `Caller ID: ${callerId}`;

    // Play ringtone
    playRingtone();

    // Start countdown
    let remaining = timeout || 20;
    document.getElementById('call-timer').textContent = `${remaining}s`;
    ringTimerInterval = setInterval(() => {
      remaining--;
      document.getElementById('call-timer').textContent = `${remaining}s`;
      if (remaining <= 0) {
        clearInterval(ringTimerInterval);
        hideCallNotification();
      }
    }, 1000);
  }

  function handleCallConnected({ callId }) {
    hideCallNotification();

    // Show active call panel
    const panel = document.getElementById('active-call-panel');
    panel.style.display = 'block';

    // Start duration timer
    callStartTime = Date.now();
    callTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      document.getElementById('call-duration').textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function handleCallEnded({ callId, reason }) {
    hideCallNotification();
    hideActiveCall();
    WebRTCManager.cleanup();
    currentCallId = null;
    loadCallLogs();
  }

  function acceptCall() {
    if (!currentCallId) return;
    const socket = SocketManager.getSocket();
    if (socket) {
      socket.emit('call:accept', { callId: currentCallId });
    }
    stopRingtone();
  }

  function rejectCall() {
    if (!currentCallId) return;
    const socket = SocketManager.getSocket();
    if (socket) {
      socket.emit('call:reject', { callId: currentCallId });
    }
    hideCallNotification();
    currentCallId = null;
  }

  function hangupCall() {
    const callId = currentCallId || WebRTCManager.getCurrentCallId();
    if (!callId) return;
    const socket = SocketManager.getSocket();
    if (socket) {
      socket.emit('call:hangup', { callId });
    }
    hideActiveCall();
    WebRTCManager.cleanup();
    currentCallId = null;
    loadCallLogs();
  }

  function hideCallNotification() {
    document.getElementById('call-notification').style.display = 'none';
    clearInterval(ringTimerInterval);
    stopRingtone();
  }

  function hideActiveCall() {
    document.getElementById('active-call-panel').style.display = 'none';
    document.getElementById('call-duration').textContent = '00:00';
    clearInterval(callTimerInterval);
    callStartTime = null;
  }

  function playRingtone() {
    stopRingtone();
    // Use a simple oscillator-based ringtone since we can't bundle audio files
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.setValueAtTime(480, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      };
      playTone();
      ringtoneAudio = setInterval(playTone, 1500);
      ringtoneAudio = { interval: ringtoneAudio, ctx: audioCtx };
    } catch (err) {
      console.warn('Could not play ringtone:', err);
    }
  }

  function stopRingtone() {
    if (ringtoneAudio) {
      clearInterval(ringtoneAudio.interval);
      if (ringtoneAudio.ctx) ringtoneAudio.ctx.close().catch(() => {});
      ringtoneAudio = null;
    }
  }

  async function loadCallLogs() {
    try {
      const res = await Auth.fetchWithAuth(`${Auth.API()}/api/calls?limit=20`);
      if (!res.ok) return;
      const { calls } = await res.json();
      renderCallLogs(calls);
    } catch (err) {
      console.error('Failed to load call logs:', err);
    }
  }

  function renderCallLogs(calls) {
    const list = document.getElementById('call-log-list');
    if (!calls || calls.length === 0) {
      list.innerHTML = '<p class="empty-state">No recent calls</p>';
      return;
    }

    list.innerHTML = calls.map(call => {
      const time = new Date(call.queued_at).toLocaleString();
      const duration = call.duration_sec ? `${Math.floor(call.duration_sec / 60)}:${String(call.duration_sec % 60).padStart(2, '0')}` : '-';
      return `
        <div class="call-log-item">
          <div>
            <strong>${call.agent_name || 'Unassigned'}</strong>
            <span style="color: #94a3b8; margin-left: 0.5rem;">${time}</span>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span>${duration}</span>
            <span class="call-log-status ${call.status}">${call.status}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  return { init, loadCallLogs };
})();
