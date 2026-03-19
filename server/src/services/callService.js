const pool = require('../config/database');

async function createCall(callerId, metadata = {}) {
  const result = await pool.query(
    'INSERT INTO call_logs (caller_id, metadata) VALUES ($1, $2) RETURNING *',
    [callerId, JSON.stringify(metadata)]
  );
  return result.rows[0];
}

async function updateCallStatus(callId, status, extra = {}) {
  const sets = ['status = $2'];
  const values = [callId, status];
  let idx = 3;

  if (extra.agentId) {
    sets.push(`agent_id = $${idx++}`);
    values.push(extra.agentId);
  }
  if (extra.answeredAt) {
    sets.push(`answered_at = $${idx++}`);
    values.push(extra.answeredAt);
  }
  if (extra.endedAt) {
    sets.push(`ended_at = $${idx++}`);
    values.push(extra.endedAt);
  }
  if (extra.durationSec !== undefined) {
    sets.push(`duration_sec = $${idx++}`);
    values.push(extra.durationSec);
  }
  if (extra.endReason) {
    sets.push(`end_reason = $${idx++}`);
    values.push(extra.endReason);
  }

  const sql = `UPDATE call_logs SET ${sets.join(', ')} WHERE id = $1 RETURNING *`;
  const result = await pool.query(sql, values);
  return result.rows[0];
}

async function getRecentCalls(limit = 50) {
  const result = await pool.query(
    `SELECT cl.*, a.display_name as agent_name
     FROM call_logs cl
     LEFT JOIN agents a ON cl.agent_id = a.id
     ORDER BY cl.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

module.exports = {
  createCall,
  updateCallStatus,
  getRecentCalls,
};
