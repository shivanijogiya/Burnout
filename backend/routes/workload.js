const express = require('express');
const router = express.Router();
const { calculateWorkloadScores, getWorkloadData } = require('../services/workload');
const { predictBurnout } = require('../services/burnout');
const { authMiddleware } = require('./auth');

// Get workload data
router.get('/', authMiddleware, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await getWorkloadData(req.userId, days);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get workload for specific student (proctor access)
router.get('/student/:studentId', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'proctor') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const days = parseInt(req.query.days) || 30;
    const data = await getWorkloadData(req.params.studentId, days);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ NEW: Manual recalculation endpoint
router.post('/recalculate', authMiddleware, async (req, res) => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Last 30 days

    // Recalculate workload
    await calculateWorkloadScores(req.userId, startDate, endDate);

    // Recalculate burnout
    const analysis = await predictBurnout(req.userId);

    res.json({ 
      success: true, 
      message: 'Workload and burnout recalculated',
      analysis 
    });
  } catch (error) {
    console.error('Recalculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;