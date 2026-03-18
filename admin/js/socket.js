window.SocketManager = (function() {
  let socket = null;
  let reconnectTimer = null;
  const listeners = {};

  function connect(token) {
    if (socket && socket.connected) return socket;

    const url = window.WEBCALL_CONFIG.API_URL + '/admin';

    socket = io(url, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 50,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('Socket connected');
      updateConnectionUI('connected', 'Connected');
      emit('connected');
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      updateConnectionUI('disconnected', 'Disconnected');
      emit('disconnected', reason);
    });

    socket.on('connect_error', async (err) => {
      console.error('Socket connection error:', err.message);
      updateConnectionUI('disconnected', 'Connection Error');

      // Try token refresh on auth errors
      if (err.message.includes('expired') || err.message.includes('Invalid')) {
        const refreshed = await Auth.refreshToken();
        if (refreshed) {
          socket.auth = { token: refreshed.accessToken };
          socket.connect();
        } else {
          emit('auth-error');
        }
      }
    });

    return socket;
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }

  function getSocket() {
    return socket;
  }

  function on(event, handler) {
    if (socket) socket.on(event, handler);
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(handler);
  }

  function off(event, handler) {
    if (socket) socket.off(event, handler);
    if (listeners[event]) {
      listeners[event] = listeners[event].filter(h => h !== handler);
    }
  }

  function emit(event, data) {
    if (socket && socket.connected) {
      socket.emit(event, data);
    }
    // Also fire local listeners for internal events
    if (listeners[event]) {
      listeners[event].forEach(h => h(data));
    }
  }

  function updateConnectionUI(status, text) {
    const el = document.getElementById('connection-status');
    if (el) {
      el.className = 'connection-status ' + status;
      el.textContent = text;
    }
  }

  return { connect, disconnect, getSocket, on, off, emit };
})();
