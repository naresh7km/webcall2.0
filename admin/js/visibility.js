window.Visibility = (function() {
  let heartbeatInterval = null;
  let isVisible = !document.hidden;

  function start() {
    document.addEventListener('visibilitychange', onVisibilityChange);
    startHeartbeat();
    // Send initial state
    sendVisibility(isVisible);
  }

  function stop() {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    stopHeartbeat();
  }

  function onVisibilityChange() {
    isVisible = !document.hidden;
    sendVisibility(isVisible);

    if (isVisible) {
      startHeartbeat();
    } else {
      stopHeartbeat();
    }
  }

  function sendVisibility(visible) {
    const socket = SocketManager.getSocket();
    if (socket && socket.connected) {
      socket.emit('agent:visibility-change', { visible });
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      const socket = SocketManager.getSocket();
      if (socket && socket.connected) {
        socket.emit('agent:heartbeat');
      }
    }, 5000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  function getIsVisible() {
    return isVisible;
  }

  return { start, stop, getIsVisible };
})();
