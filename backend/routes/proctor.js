const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Signal = require('../models/Signal');
const Intervention = require('../models/Intervention');
const { predictBurnout } = require('../services/burnout');
const { authMiddleware } = require('./auth');

// Get assigned students with risk summary
router.get('/students', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'proctor') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all students (in real app, filter by assigned students)
    const students = await User.find({ role: 'student' })
      .select('name email rollNumber department semester');

    // Get latest signals for each student
    const studentsWithRisk = await Promise.all(
      students.map(async (student) => {
        const latestSignal = await Signal.findOne({ studentId: student._id })
          .sort({ date: -1 });

        return {
          id: student._id,
          name: student.name,
          email: student.email,
          rollNumber: student.rollNumber,
          department: student.department,
          semester: student.semester,
          burnoutRisk: latestSignal?.burnoutRisk || 'low',
          burnoutScore: latestSignal?.burnoutScore || 0,
          lastAnalyzed: latestSignal?.date
        };
      })
    );

    // Sort by risk level
    studentsWithRisk.sort((a, b) => {
      const riskOrder = { high: 3, medium: 2, low: 1 };
      return riskOrder[b.burnoutRisk] - riskOrder[a.burnoutRisk];
    });

    res.json(studentsWithRisk);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get detailed student info
router.get('/student/:studentId', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'proctor') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const student = await User.findById(req.params.studentId)
      .select('-password');

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get latest analysis
    const analysis = await predictBurnout(req.params.studentId);

    // Get interventions
    const interventions = await Intervention.find({
      studentId: req.params.studentId
    })
      .populate('proctorId', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      student,
      analysis,
      interventions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add intervention/suggestion
router.post('/intervention', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'proctor') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { studentId, type, message } = req.body;

    const intervention = await Intervention.create({
      studentId,
      proctorId: req.userId,
      type,
      message
    });

    res.status(201).json(intervention);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get interventions for a student
router.get('/interventions/:studentId', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'proctor') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const interventions = await Intervention.find({
      studentId: req.params.studentId
    })
      .populate('proctorId', 'name')
      .sort({ createdAt: -1 });

    res.json(interventions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update intervention status
router.put('/intervention/:id', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'proctor') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { status } = req.body;

    const intervention = await Intervention.findByIdAndUpdate(
      req.params.id,
      {
        status,
        ...(status === 'acknowledged' && { acknowledgedAt: new Date() })
      },
      { new: true }
    );

    res.json(intervention);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;