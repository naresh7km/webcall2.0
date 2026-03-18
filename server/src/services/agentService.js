const pool = require('../config/database');

async function findById(id) {
  const result = await pool.query('SELECT * FROM agents WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function findByEmail(email) {
  const result = await pool.query('SELECT * FROM agents WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function getAll() {
  const result = await pool.query(
    'SELECT id, email, display_name, role, priority, is_available, is_online, is_busy, last_heartbeat, created_at FROM agents ORDER BY priority ASC, display_name ASC'
  );
  return result.rows;
}

async function getAvailableAgents() {
  const result = await pool.query(
    `SELECT id, display_name, priority
     FROM agents
     WHERE is_available = true
       AND is_online = true
       AND is_busy = false
       AND last_heartbeat > NOW() - INTERVAL '15 seconds'
     ORDER BY priority ASC`
  );
  return result.rows;
}

async function setOnline(agentId, online) {
  await pool.query(
    'UPDATE agents SET is_online = $1, last_heartbeat = NOW(), updated_at = NOW() WHERE id = $2',
    [online, agentId]
  );
}

async function setAvailable(agentId, available) {
  await pool.query(
    'UPDATE agents SET is_available = $1, updated_at = NOW() WHERE id = $2',
    [available, agentId]
  );
}

async function setBusy(agentId, busy) {
  await pool.query(
    'UPDATE agents SET is_busy = $1, updated_at = NOW() WHERE id = $2',
    [busy, agentId]
  );
}

async function updateHeartbeat(agentId) {
  await pool.query(
    'UPDATE agents SET last_heartbeat = NOW(), is_online = true WHERE id = $1',
    [agentId]
  );
}

async function setPriority(agentId, priority) {
  await pool.query(
    'UPDATE agents SET priority = $1, updated_at = NOW() WHERE id = $2',
    [priority, agentId]
  );
}

async function markStaleAgentsOffline() {
  const result = await pool.query(
    `UPDATE agents SET is_online = false, updated_at = NOW()
     WHERE is_online = true AND last_heartbeat < NOW() - INTERVAL '15 seconds'
     RETURNING id`
  );
  return result.rows.map(r => r.id);
}

async function resetAllOnlineStatus() {
  await pool.query('UPDATE agents SET is_online = false, is_busy = false');
}

module.exports = {
  findById,
  findByEmail,
  getAll,
  getAvailableAgents,
  setOnline,
  setAvailable,
  setBusy,
  updateHeartbeat,
  setPriority,
  markStaleAgentsOffline,
  resetAllOnlineStatus,
};
