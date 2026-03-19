window.WebRTCManager = (function() {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    // Free TURN servers for NAT traversal reliability
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
  let localStream = null;
  let currentCallId = null;
  let pendingCandidates = []; // Buffer for ICE candidates arriving before remote description
  let remoteDescriptionSet = false;

  async function handleOffer(callId, sdp) {
    currentCallId = callId;
    pendingCandidates = [];
    remoteDescriptionSet = false;

    // Clean up any previous connection
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // ICE candidate handling — send our candidates to the caller
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = SocketManager.getSocket();
        if (socket) {
          socket.emit('webrtc:ice-candidate', { callId, candidate: event.candidate });
        }
      }
    };

    // Remote audio stream
    peerConnection.ontrack = (event) => {
      console.log('[WebRTC Agent] ontrack fired, streams:', event.streams.length);
      const audio = document.getElementById('remote-audio');
      if (audio && event.streams[0]) {
        audio.srcObject = event.streams[0];
        // Force play in case autoplay is blocked
        audio.play().catch(err => console.warn('[WebRTC Agent] audio.play() failed:', err));
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection ? peerConnection.iceConnectionState : 'no-pc';
      console.log('[WebRTC Agent] ICE connection state:', state);

      if (state === 'connected' || state === 'completed') {
        console.log('[WebRTC Agent] Audio connection established successfully');
      }

      if (state === 'failed') {
        console.warn('[WebRTC Agent] ICE connection failed, attempting restart');
        // Attempt ICE restart
        if (peerConnection) {
          peerConnection.restartIce();
        }
      }

      if (state === 'disconnected') {
        console.warn('[WebRTC Agent] ICE disconnected, waiting for recovery...');
        // Give it a few seconds to recover before giving up
        setTimeout(() => {
          if (peerConnection && peerConnection.iceConnectionState === 'disconnected') {
            console.warn('[WebRTC Agent] ICE still disconnected, restarting');
            peerConnection.restartIce();
          }
        }, 3000);
      }
    };

    peerConnection.onicegatheringstatechange = () => {
      console.log('[WebRTC Agent] ICE gathering state:', peerConnection ? peerConnection.iceGatheringState : 'no-pc');
    };

    // Get local microphone audio FIRST before setting remote description
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
      console.log('[WebRTC Agent] Local audio track added');
    } catch (err) {
      console.error('[WebRTC Agent] Failed to get microphone access:', err);
      cleanup();
      return;
    }

    // Set remote description (the offer) and create answer
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[WebRTC Agent] Remote description (offer) set');

      // Now flush any buffered ICE candidates
      remoteDescriptionSet = true;
      if (pendingCandidates.length > 0) {
        console.log(`[WebRTC Agent] Flushing ${pendingCandidates.length} buffered ICE candidates`);
        for (const candidate of pendingCandidates) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
            console.warn('[WebRTC Agent] Buffered ICE candidate error:', err);
          });
        }
        pendingCandidates = [];
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log('[WebRTC Agent] Local description (answer) set');

      const socket = SocketManager.getSocket();
      if (socket) {
        socket.emit('webrtc:answer', { callId, sdp: answer });
        console.log('[WebRTC Agent] Answer sent to server');
      }
    } catch (err) {
      console.error('[WebRTC Agent] WebRTC answer error:', err);
      cleanup();
    }
  }

  function addIceCandidate(candidate) {
    if (!candidate) return;

    if (!peerConnection) {
      console.warn('[WebRTC Agent] No peer connection, dropping ICE candidate');
      return;
    }

    if (!remoteDescriptionSet) {
      // Buffer candidates until remote description is set
      console.log('[WebRTC Agent] Buffering ICE candidate (remote description not set yet)');
      pendingCandidates.push(candidate);
      return;
    }

    peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
      console.warn('[WebRTC Agent] ICE candidate error:', err);
    });
  }

  function cleanup() {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
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

  function toggleMute() {
    if (!localStream) return false;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return false;
    audioTrack.enabled = !audioTrack.enabled;
    return !audioTrack.enabled; // returns true if now muted
  }

  function isMuted() {
    if (!localStream) return false;
    const audioTrack = localStream.getAudioTracks()[0];
    return audioTrack ? !audioTrack.enabled : false;
  }

  function getCurrentCallId() {
    return currentCallId;
  }

  return { handleOffer, addIceCandidate, cleanup, getCurrentCallId, toggleMute, isMuted };
})();
