window.AgentsPanel = (function() {
  let agents = [];
  let currentAgent = null;
  let initialized = false;

  function init(agent) {
    currentAgent = agent;

    // Show create-agent form for admins
    if (agent.role === 'admin') {
      document.getElementById('create-agent-panel').style.display = 'block';
      if (!initialized) {
        setupCreateForm();
      }
    }

    initialized = true;
  }

  // Called after socket connects to bind socket-specific events
  function bindSocketEvents(socket) {
    socket.off('agents:status-update', handleStatusUpdate);
    socket.off('admin:agents-list', handleAgentsList);

    socket.on('agents:status-update', handleStatusUpdate);
    socket.on('admin:agents-list', handleAgentsList);

    // Request initial agent list (works for admin role; agents get it via broadcast)
    socket.emit('admin:get-agents');
  }

  function handleStatusUpdate({ agents: updated }) {
    agents = updated;
    render();
  }

  function handleAgentsList({ agents: list }) {
    agents = list;
    render();
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
      const isSelf = currentAgent && currentAgent.id === agent.id;

      return `
        <div class="agent-item" data-id="${agent.id}">
          <div class="agent-item-left">
            <div class="agent-status-dot ${statusClass}"></div>
            <div class="agent-item-info">
              <h4>${escapeHtml(agent.display_name)}</h4>
              <p>${statusText} &middot; ${agent.role}</p>
              ${isAdmin ? `<p class="agent-credentials"><span class="agent-email">${escapeHtml(agent.email)}</span>${agent.password_plain ? ` &middot; <span class="agent-password">${escapeHtml(agent.password_plain)}</span>` : ''}</p>` : ''}
            </div>
          </div>
          <div class="agent-item-right">
            ${isAdmin
              ? `<input type="number" class="priority-input" value="${agent.priority}" min="1" max="999" data-agent-id="${agent.id}" title="Priority (lower = higher priority)">`
              : `<span class="priority-badge">P${agent.priority}</span>`
            }
            ${isAdmin && !isSelf ? `<button class="btn btn-delete-agent" data-agent-id="${agent.id}" data-agent-name="${escapeHtml(agent.display_name)}" title="Delete agent">✕</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Bind priority change and delete handlers for admins
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

      list.querySelectorAll('.btn-delete-agent').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const agentId = e.target.dataset.agentId;
          const agentName = e.target.dataset.agentName;
          if (!confirm(`Delete agent "${agentName}"? This cannot be undone.`)) return;

          try {
            const res = await Auth.fetchWithAuth(`${Auth.API()}/api/agents/${agentId}`, {
              method: 'DELETE',
            });
            if (!res.ok) {
              const err = await res.json();
              alert(err.error || 'Failed to delete agent');
              return;
            }
            // Refresh agent list
            const socket = SocketManager.getSocket();
            if (socket) socket.emit('admin:get-agents');
          } catch (err) {
            alert('Failed to delete agent: ' + err.message);
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

  return { init, bindSocketEvents, render };
})();
