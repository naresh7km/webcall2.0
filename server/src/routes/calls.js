const express = require('express');
const { authenticate } = require('../middleware/auth');
const callService = require('../services/callService');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const calls = await callService.getRecentCalls(limit);
    res.json({ calls });
  } catch (err) {
    console.error('Get calls error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
