const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const agentService = require('../services/agentService');
const authService = require('../services/authService');

const router = express.Router();

// Get all agents (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const agents = await agentService.getAll();
    res.json({ agents });
  } catch (err) {
    console.error('Get agents error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create agent (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { email, password, displayName, role } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'Email, password, and displayName are required' });
    }

    const existing = await agentService.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await authService.hashPassword(password);
    const pool = require('../config/database');
    const result = await pool.query(
      'INSERT INTO agents (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, display_name, role, priority',
      [email, passwordHash, displayName, role || 'agent']
    );

    res.status(201).json({ agent: result.rows[0] });
  } catch (err) {
    console.error('Create agent error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update agent priority (admin only)
router.put('/:id/priority', authenticate, requireAdmin, async (req, res) => {
  try {
    const { priority } = req.body;
    if (typeof priority !== 'number') {
      return res.status(400).json({ error: 'Priority must be a number' });
    }
    await agentService.setPriority(req.params.id, priority);
    res.json({ success: true });
  } catch (err) {
    console.error('Update priority error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
