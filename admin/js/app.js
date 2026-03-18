// Main App Controller
(function() {
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');

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
    await Auth.logout();
    showView(loginView);
  });

  // Availability toggle
  document.getElementById('availability-toggle').addEventListener('change', (e) => {
    const available = e.target.checked;
    const label = document.getElementById('availability-label');
    label.textContent = available ? 'Available' : 'Unavailable';
    const socket = SocketManager.getSocket();
    if (socket) {
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

    // Load Socket.IO dynamically if not already loaded
    loadSocketIO(() => {
      // Connect socket
      const token = Auth.getAccessToken();
      SocketManager.connect(token);

      // Init modules
      Visibility.start();
      AgentsPanel.init(agent);
      CallsPanel.init();

      // Handle auth errors from socket
      SocketManager.on('auth-error', () => {
        Visibility.stop();
        SocketManager.disconnect();
        Auth.clear();
        showView(loginView);
      });
    });
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
