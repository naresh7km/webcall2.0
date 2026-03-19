window.WebRTCManager = (function() {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  let peerConnection = null;
  let localStream = null;
  let currentCallId = null;

  async function handleOffer(callId, sdp) {
    currentCallId = callId;

    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // ICE candidate handling
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
      const audio = document.getElementById('remote-audio');
      if (audio && event.streams[0]) {
        audio.srcObject = event.streams[0];
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === 'failed' ||
          peerConnection.iceConnectionState === 'disconnected') {
        console.warn('ICE connection issue');
      }
    };

    // Get local microphone audio
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    } catch (err) {
      console.error('Failed to get microphone access:', err);
      cleanup();
      return;
    }

    // Set remote description (the offer) and create answer
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      const socket = SocketManager.getSocket();
      if (socket) {
        socket.emit('webrtc:answer', { callId, sdp: answer });
      }
    } catch (err) {
      console.error('WebRTC answer error:', err);
      cleanup();
    }
  }

  function addIceCandidate(candidate) {
    if (peerConnection && peerConnection.remoteDescription) {
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
        console.error('ICE candidate error:', err);
      });
    }
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
