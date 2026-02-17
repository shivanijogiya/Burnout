const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const { WEIGHTS } = require('../config/constants');
const { calculateWorkloadScores } = require('../services/workload');
const { authMiddleware } = require('./auth');

// Get all tasks for a student
router.get('/', authMiddleware, async (req, res) => {
  try {
    const tasks = await Task.find({ studentId: req.userId }).sort({ deadline: 1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create task
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, type, subject, deadline, estimatedEffort } = req.body;

    // Calculate weight based on type
    const weight = WEIGHTS[type] || WEIGHTS.default;

    const task = await Task.create({
      studentId: req.userId,
      title,
      type,
      subject,
      deadline: new Date(deadline),
      estimatedEffort,
      weight
    });

    // Recalculate workload scores
    const taskDate = new Date(deadline);
    const startDate = new Date(taskDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(taskDate);
    endDate.setDate(endDate.getDate() + 7);
    
    await calculateWorkloadScores(req.userId, startDate, endDate);

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, type, subject, deadline, estimatedEffort, completed } = req.body;

    const weight = type ? (WEIGHTS[type] || WEIGHTS.default) : undefined;

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, studentId: req.userId },
      {
        ...(title && { title }),
        ...(type && { type, weight }),
        ...(subject && { subject }),
        ...(deadline && { deadline: new Date(deadline) }),
        ...(estimatedEffort !== undefined && { estimatedEffort }),
        ...(completed !== undefined && { completed })
      },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Recalculate workload scores
    const taskDate = new Date(task.deadline);
    const startDate = new Date(taskDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(taskDate);
    endDate.setDate(endDate.getDate() + 7);
    
    await calculateWorkloadScores(req.userId, startDate, endDate);

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete task
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      studentId: req.userId
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Recalculate workload scores
    const taskDate = new Date(task.deadline);
    const startDate = new Date(taskDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(taskDate);
    endDate.setDate(endDate.getDate() + 7);
    
    await calculateWorkloadScores(req.userId, startDate, endDate);

    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const task = await Task.create({
      studentId: req.userId,
      ...req.body
    });

    // ✅ NEW: Auto-recalculate workload
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    // Don't await - run in background
    calculateWorkloadScores(req.userId, startDate, endDate)
      .then(() => predictBurnout(req.userId))
      .catch(err => console.error('Auto-recalc error:', err));

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;