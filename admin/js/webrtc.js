window.WebRTCManager = (function() {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];

  let peerConnection = null;
  let localStream = null;       // Pre-acquired mic stream (persists across calls)
  let currentCallId = null;
  let pendingCandidates = [];
  let remoteDescriptionSet = false;

  // Pre-acquire microphone as soon as agent logs in.
  // This avoids the getUserMedia delay during call setup which causes
  // race conditions with ICE candidates and signaling.
  async function acquireMic() {
    if (localStream) {
      // Already have a stream, check if tracks are still alive
      const track = localStream.getAudioTracks()[0];
      if (track && track.readyState === 'live') {
        console.log('[WebRTC Agent] Mic already acquired');
        return true;
      }
    }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      console.log('[WebRTC Agent] Mic pre-acquired successfully');
      return true;
    } catch (err) {
      console.error('[WebRTC Agent] Failed to pre-acquire mic:', err);
      localStream = null;
      return false;
    }
  }

  async function handleOffer(callId, sdp) {
    currentCallId = callId;
    pendingCandidates = [];
    remoteDescriptionSet = false;

    // Clean up any previous connection (but keep localStream)
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    // Ensure we have mic access (should already be acquired, but fallback)
    if (!localStream || localStream.getAudioTracks()[0]?.readyState !== 'live') {
      console.log('[WebRTC Agent] Mic not ready, acquiring now...');
      const ok = await acquireMic();
      if (!ok) {
        console.error('[WebRTC Agent] Cannot proceed without microphone');
        return;
      }
    }

    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Send our ICE candidates to the caller
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = SocketManager.getSocket();
        if (socket) {
          socket.emit('webrtc:ice-candidate', { callId, candidate: event.candidate });
        }
      }
    };

    // Receive remote audio from caller
    peerConnection.ontrack = (event) => {
      console.log('[WebRTC Agent] ontrack fired, streams:', event.streams.length);
      const audio = document.getElementById('remote-audio');
      if (audio && event.streams[0]) {
        audio.srcObject = event.streams[0];
        audio.play().catch(err => console.warn('[WebRTC Agent] audio.play() failed:', err));
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      const st = peerConnection ? peerConnection.iceConnectionState : 'no-pc';
      console.log('[WebRTC Agent] ICE connection state:', st);

      if (st === 'connected' || st === 'completed') {
        console.log('[WebRTC Agent] Audio path established');
      }
      if (st === 'failed') {
        console.warn('[WebRTC Agent] ICE failed, restarting');
        if (peerConnection) peerConnection.restartIce();
      }
      if (st === 'disconnected') {
        setTimeout(() => {
          if (peerConnection && peerConnection.iceConnectionState === 'disconnected') {
            console.warn('[WebRTC Agent] ICE still disconnected, restarting');
            peerConnection.restartIce();
          }
        }, 3000);
      }
    };

    // Step 1: Set remote description FIRST (creates transceivers from the offer)
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[WebRTC Agent] Remote description (offer) set');

      remoteDescriptionSet = true;
      if (pendingCandidates.length > 0) {
        console.log(`[WebRTC Agent] Flushing ${pendingCandidates.length} buffered ICE candidates`);
        for (const c of pendingCandidates) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(c)).catch(err =>
            console.warn('[WebRTC Agent] Buffered ICE candidate error:', err)
          );
        }
        pendingCandidates = [];
      }
    } catch (err) {
      console.error('[WebRTC Agent] Failed to set remote description:', err);
      cleanupConnection();
      return;
    }

    // Step 2: Add pre-acquired local tracks (reuses transceivers from the offer)
    localStream.getAudioTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    console.log('[WebRTC Agent] Local audio track added to peer connection');

    // Step 3: Create and send answer
    try {
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log('[WebRTC Agent] Answer created and local description set');

      const socket = SocketManager.getSocket();
      if (socket) {
        socket.emit('webrtc:answer', { callId, sdp: answer });
        console.log('[WebRTC Agent] Answer sent to server');
      }
    } catch (err) {
      console.error('[WebRTC Agent] WebRTC answer error:', err);
      cleanupConnection();
    }
  }

  function addIceCandidate(candidate) {
    if (!candidate) return;
    if (!peerConnection) {
      console.warn('[WebRTC Agent] No peer connection, dropping ICE candidate');
      return;
    }
    if (!remoteDescriptionSet) {
      console.log('[WebRTC Agent] Buffering ICE candidate (remote description not set yet)');
      pendingCandidates.push(candidate);
      return;
    }
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
      console.warn('[WebRTC Agent] ICE candidate error:', err);
    });
  }

  // Clean up peer connection only (keep mic stream alive for next call)
  function cleanupConnection() {
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    const audio = document.getElementById('remote-audio');
    if (audio) audio.srcObject = null;
    currentCallId = null;
    pendingCandidates = [];
    remoteDescriptionSet = false;
  }

  // Full cleanup including mic (called on logout)
  function cleanup() {
    cleanupConnection();
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
  }

  function toggleMute() {
    if (!localStream) return false;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return false;
    audioTrack.enabled = !audioTrack.enabled;
    return !audioTrack.enabled;
  }

  function isMuted() {
    if (!localStream) return false;
    const audioTrack = localStream.getAudioTracks()[0];
    return audioTrack ? !audioTrack.enabled : false;
  }

  function getCurrentCallId() {
    return currentCallId;
  }

  return { acquireMic, handleOffer, addIceCandidate, cleanup, cleanupConnection, getCurrentCallId, toggleMute, isMuted };
})();
