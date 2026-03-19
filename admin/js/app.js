// Main App Controller
(function() {
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  let dashboardInitialized = false;

  // Hamburger menu toggle
  const menuBtn = document.getElementById('topbar-menu-btn');
  const topbarRight = document.getElementById('topbar-right');
  if (menuBtn && topbarRight) {
    menuBtn.addEventListener('click', () => {
      menuBtn.classList.toggle('active');
      topbarRight.classList.toggle('open');
    });
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.topbar')) {
        menuBtn.classList.remove('active');
        topbarRight.classList.remove('open');
      }
    });
  }

  function showView(view) {
    loginView.classList.remove('active');
    dashboardView.classList.remove('active');
    view.classList.add('active');
  }

  // Check if already logged in
  if (Auth.isLoggedIn()) {
    initDashboard();
  } else {
    showView(loginView);
  }

  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    errorEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      await Auth.login(email, password);
      initDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    Visibility.stop();
    SocketManager.disconnect();
    WebRTCManager.cleanup(); // Full cleanup including mic on logout
    await Auth.logout();
    dashboardInitialized = false;
    showView(loginView);
  });

  // Availability toggle
  document.getElementById('availability-toggle').addEventListener('change', (e) => {
    const available = e.target.checked;
    const label = document.getElementById('availability-label');
    label.textContent = available ? 'Available' : 'Unavailable';
    const socket = SocketManager.getSocket();
    if (socket && socket.connected) {
      socket.emit('agent:set-available', { available });
    }
  });

  function initDashboard() {
    const agent = Auth.getAgent();
    if (!agent) {
      showView(loginView);
      return;
    }

    // Update UI
    document.getElementById('agent-name').textContent = agent.displayName;
    const roleEl = document.getElementById('agent-role');
    roleEl.textContent = agent.role;
    roleEl.className = `badge badge-${agent.role}`;

    showView(dashboardView);

    // Pre-acquire microphone immediately on dashboard load.
    // This ensures the browser permission is granted early (from user gesture of login click)
    // and the mic stream is ready instantly when a call comes in.
    WebRTCManager.acquireMic();

    // Init panels (DOM-only setup, safe to call multiple times)
    AgentsPanel.init(agent);
    CallsPanel.init();

    // Load Socket.IO dynamically if not already loaded
    loadSocketIO(() => {
      // Connect socket
      const token = Auth.getAccessToken();
      const socket = SocketManager.connect(token);

      // Sync availability toggle when server sends agent's current state
      socket.on('agent:self-status', ({ is_available }) => {
        const toggle = document.getElementById('availability-toggle');
        const label = document.getElementById('availability-label');
        toggle.checked = is_available;
        label.textContent = is_available ? 'Available' : 'Unavailable';
      });

      // When socket connects, bind server event listeners
      socket.on('connect', () => {
        // Bind socket events for panels (these clean up old listeners first)
        AgentsPanel.bindSocketEvents(socket);
        CallsPanel.bindSocketEvents(socket);
      });

      // If already connected (synchronous), bind immediately
      if (socket.connected) {
        AgentsPanel.bindSocketEvents(socket);
        CallsPanel.bindSocketEvents(socket);
      }

      // Start visibility/heartbeat tracking
      Visibility.start();

      // Handle auth errors from socket
      SocketManager.onLocal('auth-error', () => {
        Visibility.stop();
        SocketManager.disconnect();
        Auth.clear();
        dashboardInitialized = false;
        showView(loginView);
      });
    });

    dashboardInitialized = true;
  }

  function loadSocketIO(callback) {
    if (window.io) return callback();
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
    script.onload = callback;
    script.onerror = () => {
      console.error('Failed to load Socket.IO');
      alert('Failed to load Socket.IO library. Check your internet connection.');
    };
    document.head.appendChild(script);
  }
})();
