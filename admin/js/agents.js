window.AgentsPanel = (function() {
  let agents = [];
  let currentAgent = null;

  function init(agent) {
    currentAgent = agent;

    // Show create-agent form for admins
    if (agent.role === 'admin') {
      document.getElementById('create-agent-panel').style.display = 'block';
      setupCreateForm();
    }

    // Listen for agent status updates
    const socket = SocketManager.getSocket();
    if (socket) {
      socket.on('agents:status-update', ({ agents: updated }) => {
        agents = updated;
        render();
      });

      socket.on('admin:agents-list', ({ agents: list }) => {
        agents = list;
        render();
      });

      // Request initial list
      socket.emit('admin:get-agents');
    }
  }

  function render() {
    const list = document.getElementById('agent-list');
    if (!agents || agents.length === 0) {
      list.innerHTML = '<p class="empty-state">No agents found</p>';
      return;
    }

    list.innerHTML = agents.map(agent => {
      const statusClass = agent.is_busy ? 'busy' : (agent.is_online && agent.is_available ? 'online' : 'offline');
      const statusText = agent.is_busy ? 'Busy' : (agent.is_online && agent.is_available ? 'Available' : 'Offline');
      const isAdmin = currentAgent && currentAgent.role === 'admin';

      return `
        <div class="agent-item" data-id="${agent.id}">
          <div class="agent-item-left">
            <div class="agent-status-dot ${statusClass}"></div>
            <div class="agent-item-info">
              <h4>${escapeHtml(agent.display_name)}</h4>
              <p>${statusText} &middot; ${agent.role}</p>
            </div>
          </div>
          <div class="agent-item-right">
            ${isAdmin
              ? `<input type="number" class="priority-input" value="${agent.priority}" min="1" max="999" data-agent-id="${agent.id}" title="Priority (lower = higher priority)">`
              : `<span class="priority-badge">P${agent.priority}</span>`
            }
          </div>
        </div>
      `;
    }).join('');

    // Bind priority change handlers
    if (currentAgent && currentAgent.role === 'admin') {
      list.querySelectorAll('.priority-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const agentId = e.target.dataset.agentId;
          const priority = parseInt(e.target.value, 10);
          if (!isNaN(priority) && priority > 0) {
            const socket = SocketManager.getSocket();
            if (socket) {
              socket.emit('admin:set-priority', { agentId, priority });
            }
          }
        });
      });
    }
  }

  function setupCreateForm() {
    const form = document.getElementById('create-agent-form');
    const errorEl = document.getElementById('create-agent-error');
    const successEl = document.getElementById('create-agent-success');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      successEl.textContent = '';

      const displayName = document.getElementById('new-agent-name').value.trim();
      const email = document.getElementById('new-agent-email').value.trim();
      const password = document.getElementById('new-agent-password').value;
      const role = document.getElementById('new-agent-role').value;

      try {
        const res = await Auth.fetchWithAuth(`${Auth.API()}/api/agents`, {
          method: 'POST',
          body: JSON.stringify({ email, password, displayName, role }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create agent');
        }

        successEl.textContent = `Agent "${displayName}" created successfully`;
        form.reset();

        // Refresh agent list
        const socket = SocketManager.getSocket();
        if (socket) socket.emit('admin:get-agents');
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { init, render };
})();
