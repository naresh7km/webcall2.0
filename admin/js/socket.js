window.SocketManager = (function() {
  let socket = null;
  const localListeners = {};  // For internal app events only (connected, disconnected, auth-error)

  function connect(token) {
    // Disconnect existing socket cleanly before creating a new one
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }

    const url = window.WEBCALL_CONFIG.API_URL + '/admin';

    socket = io(url, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      transports: ['polling', 'websocket'],
      upgrade: true,
    });

    socket.on('connect', () => {
      console.log('Socket connected, id:', socket.id);
      updateConnectionUI('connected', 'Connected');
      fireLocal('connected');
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      updateConnectionUI('disconnected', 'Disconnected');
      fireLocal('disconnected', reason);
    });

    socket.on('connect_error', async (err) => {
      console.error('Socket connection error:', err.message);
      updateConnectionUI('disconnected', 'Connection Error');

      // Try token refresh on auth errors
      if (err.message.includes('expired') || err.message.includes('Invalid') || err.message.includes('Authentication')) {
        socket.disconnect(); // Stop reconnection attempts
        const refreshed = await Auth.refreshToken();
        if (refreshed) {
          // Reconnect with new token
          socket.auth = { token: refreshed.accessToken };
          socket.connect();
        } else {
          fireLocal('auth-error');
        }
      }
    });

    return socket;
  }

  function disconnect() {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
  }

  function getSocket() {
    return socket;
  }

  // Register a handler on the actual socket (for server events)
  function on(event, handler) {
    if (socket) socket.on(event, handler);
  }

  function off(event, handler) {
    if (socket) socket.off(event, handler);
  }

  // Register a handler for local-only app events (connected, disconnected, auth-error)
  function onLocal(event, handler) {
    if (!localListeners[event]) localListeners[event] = [];
    localListeners[event].push(handler);
  }

  function fireLocal(event, data) {
    if (localListeners[event]) {
      localListeners[event].forEach(h => h(data));
    }
  }

  function updateConnectionUI(status, text) {
    const el = document.getElementById('connection-status');
    if (el) {
      el.className = 'connection-status ' + status;
      el.textContent = text;
    }
  }

  return { connect, disconnect, getSocket, on, off, onLocal };
})();
