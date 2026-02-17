const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./auth');
const { predictBurnout, getRecommendations } = require('../services/burnout');
const Signal = require('../models/Signal');

// ============================================
// GET BURNOUT ANALYSIS FOR LOGGED-IN STUDENT
// ============================================
router.get('/analysis', authMiddleware, async (req, res) => {
  try {
    const analysis = await predictBurnout(req.userId);
    res.json(analysis);
  } catch (error) {
    console.error('Burnout analysis error:', error);
    res.status(500).json({ error: 'Failed to generate burnout analysis' });
  }
});

// ============================================
// GET RECOMMENDATIONS FOR LOGGED-IN STUDENT
// ============================================
router.get('/recommendations', authMiddleware, async (req, res) => {
  try {
    console.log(`\n🎯 Generating recommendations for student: ${req.userId}`);
    
    const burnoutAnalysis = await predictBurnout(req.userId);
    console.log(`✓ Burnout analysis complete. Risk: ${burnoutAnalysis.risk}, Score: ${burnoutAnalysis.score}`);
    
    const recommendations = await getRecommendations(req.userId, burnoutAnalysis);
    console.log(`✓ Recommendations generated successfully`);
    
    res.json(recommendations);
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// ============================================
// GET BURNOUT HISTORY
// ============================================
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const signals = await Signal.find({
      studentId: req.userId,
      date: { $gte: startDate }
    }).sort({ date: 1 });

    res.json(signals);
  } catch (error) {
    console.error('Burnout history error:', error);
    res.status(500).json({ error: 'Failed to fetch burnout history' });
  }
});

// ============================================
// GET ANALYSIS FOR SPECIFIC STUDENT (PROCTOR/ADMIN)
// ============================================
router.get('/analysis/:studentId', authMiddleware, async (req, res) => {
  try {
    // Note: Add role checking here if needed
    const analysis = await predictBurnout(req.params.studentId);
    res.json(analysis);
  } catch (error) {
    console.error('Student analysis error:', error);
    res.status(500).json({ error: 'Failed to generate analysis' });
  }
});

// ============================================
// GET RECOMMENDATIONS FOR SPECIFIC STUDENT (PROCTOR/ADMIN)
// ============================================
router.get('/recommendations/:studentId', authMiddleware, async (req, res) => {
  try {
    // Note: Add role checking here if needed
    const burnoutAnalysis = await predictBurnout(req.params.studentId);
    const recommendations = await getRecommendations(req.params.studentId, burnoutAnalysis);
    
    res.json(recommendations);
  } catch (error) {
    console.error('Student recommendations error:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

module.exports = router;