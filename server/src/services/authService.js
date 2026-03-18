const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const env = require('../config/env');

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateAccessToken(agent) {
  return jwt.sign(
    { agentId: agent.id, email: agent.email, role: agent.role },
    env.jwtSecret,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken() {
  return uuidv4() + '-' + uuidv4();
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

async function login(email, password) {
  const result = await pool.query('SELECT * FROM agents WHERE email = $1', [email]);
  const agent = result.rows[0];
  if (!agent) return null;

  const valid = await comparePassword(password, agent.password_hash);
  if (!valid) return null;

  const accessToken = generateAccessToken(agent);
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await pool.query(
    'INSERT INTO sessions (agent_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
    [agent.id, refreshToken, expiresAt]
  );

  return {
    accessToken,
    refreshToken,
    agent: {
      id: agent.id,
      email: agent.email,
      displayName: agent.display_name,
      role: agent.role,
    },
  };
}

async function refresh(refreshToken) {
  const result = await pool.query(
    'SELECT s.*, a.email, a.role, a.display_name FROM sessions s JOIN agents a ON s.agent_id = a.id WHERE s.refresh_token = $1 AND s.expires_at > NOW()',
    [refreshToken]
  );
  const session = result.rows[0];
  if (!session) return null;

  // Rotate refresh token
  await pool.query('DELETE FROM sessions WHERE id = $1', [session.id]);

  const agent = { id: session.agent_id, email: session.email, role: session.role };
  const newAccessToken = generateAccessToken(agent);
  const newRefreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await pool.query(
    'INSERT INTO sessions (agent_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
    [agent.id, newRefreshToken, expiresAt]
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    agent: {
      id: agent.id,
      email: agent.email,
      displayName: session.display_name,
      role: agent.role,
    },
  };
}

async function logout(refreshToken) {
  await pool.query('DELETE FROM sessions WHERE refresh_token = $1', [refreshToken]);
}

module.exports = {
  hashPassword,
  comparePassword,
  generateAccessToken,
  verifyAccessToken,
  login,
  refresh,
  logout,
};
