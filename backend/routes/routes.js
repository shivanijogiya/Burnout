const express = require('express');
const router = express.Router();
const CalendarEvent = require('../models/CalendarEvent');
const User = require('../models/User');
const WorkloadScore = require('../models/WorkloadScore');
const Signal = require('../models/Signal');
const { authMiddleware, adminMiddleware } = require('./auth');

// Middleware to check specific admin permission
const checkPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.userId);
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      if (!user.permissions[permission]) {
        return res.status(403).json({ error: `Permission '${permission}' required` });
      }
      
      next();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
};

// ============ CALENDAR MANAGEMENT ============

// Get all calendar events (institutional only)
router.get('/calendar', authMiddleware, checkPermission('manageCalendar'), async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;
    
    const query = { isPersonal: false };
    
    if (startDate && endDate) {
      query.startDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (type) {
      query.type = type;
    }
    
    const events = await CalendarEvent.find(query).sort({ startDate: 1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create institutional calendar event
router.post('/calendar', authMiddleware, checkPermission('manageCalendar'), async (req, res) => {
  try {
    const { title, type, startDate, endDate, description, venue, priority } = req.body;
    
    if (!title || !type || !startDate) {
      return res.status(400).json({ error: 'Title, type, and startDate are required' });
    }
    
    const event = await CalendarEvent.create({
      title,
      type,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      description,
      venue,
      priority: priority || 'medium',
      isPersonal: false
    });
    
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update institutional calendar event
router.put('/calendar/:id', authMiddleware, checkPermission('manageCalendar'), async (req, res) => {
  try {
    const { title, type, startDate, endDate, description, venue, priority } = req.body;
    
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      isPersonal: false
    });
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    if (title) event.title = title;
    if (type) event.type = type;
    if (startDate) event.startDate = new Date(startDate);
    if (endDate !== undefined) event.endDate = endDate ? new Date(endDate) : null;
    if (description !== undefined) event.description = description;
    if (venue !== undefined) event.venue = venue;
    if (priority) event.priority = priority;
    
    await event.save();
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete institutional calendar event
router.delete('/calendar/:id', authMiddleware, checkPermission('manageCalendar'), async (req, res) => {
  try {
    const event = await CalendarEvent.findOneAndDelete({
      _id: req.params.id,
      isPersonal: false
    });
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk create calendar events
router.post('/calendar/bulk', authMiddleware, checkPermission('manageCalendar'), async (req, res) => {
  try {
    const { events } = req.body;
    
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Events array is required' });
    }
    
    const institutionalEvents = events.map(e => ({
      ...e,
      startDate: new Date(e.startDate),
      endDate: e.endDate ? new Date(e.endDate) : undefined,
      isPersonal: false
    }));
    
    const created = await CalendarEvent.insertMany(institutionalEvents);
    res.status(201).json({ 
      message: `${created.length} events created successfully`,
      events: created 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all institutional events (dangerous - use with caution)
router.delete('/calendar/clear-all', authMiddleware, checkPermission('manageCalendar'), async (req, res) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'DELETE_ALL_EVENTS') {
      return res.status(400).json({ 
        error: 'Confirmation required. Send { "confirm": "DELETE_ALL_EVENTS" }' 
      });
    }
    
    const result = await CalendarEvent.deleteMany({ isPersonal: false });
    res.json({ 
      message: `${result.deletedCount} institutional events deleted`,
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ANALYTICS & REPORTS ============

// Get system-wide analytics
router.get('/analytics/overview', authMiddleware, checkPermission('viewAnalytics'), async (req, res) => {
  try {
    const totalStudents = await User.countDocuments({ role: 'student', isActive: true });
    const totalProctors = await User.countDocuments({ role: 'proctor', isActive: true });
    
    // Get latest signals for all students
    const students = await User.find({ role: 'student', isActive: true });
    const studentIds = students.map(s => s._id);
    
    const latestSignals = await Signal.aggregate([
      { $match: { studentId: { $in: studentIds } } },
      { $sort: { date: -1 } },
      { $group: {
          _id: '$studentId',
          latestSignal: { $first: '$$ROOT' }
        }
      }
    ]);
    
    let highRisk = 0, mediumRisk = 0, lowRisk = 0;
    
    latestSignals.forEach(s => {
      const risk = s.latestSignal.riskLevel;
      if (risk === 'high') highRisk++;
      else if (risk === 'medium') mediumRisk++;
      else lowRisk++;
    });
    
    // Students with no data yet
    const noData = totalStudents - latestSignals.length;
    
    // Get workload stats for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentWorkload = await WorkloadScore.aggregate([
      { $match: { date: { $gte: sevenDaysAgo } } },
      { $group: {
          _id: null,
          avgDailyScore: { $avg: '$dailyScore' },
          avgWeeklyScore: { $avg: '$weeklyScore' },
          maxDailyScore: { $max: '$dailyScore' }
        }
      }
    ]);
    
    res.json({
      users: {
        totalStudents,
        totalProctors,
        activeStudents: totalStudents
      },
      burnoutRisk: {
        high: highRisk,
        medium: mediumRisk,
        low: lowRisk,
        noData
      },
      workload: recentWorkload[0] || {
        avgDailyScore: 0,
        avgWeeklyScore: 0,
        maxDailyScore: 0
      },
      upcomingEvents: await CalendarEvent.countDocuments({
        isPersonal: false,
        startDate: { $gte: new Date() }
      })
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get department-wise analytics
router.get('/analytics/departments', authMiddleware, checkPermission('viewAnalytics'), async (req, res) => {
  try {
    const departments = await User.aggregate([
      { $match: { role: 'student', isActive: true } },
      { $group: {
          _id: '$department',
          count: { $sum: 1 },
          students: { $push: '$_id' }
        }
      }
    ]);
    
    // Get risk levels for each department
    for (let dept of departments) {
      const latestSignals = await Signal.aggregate([
        { $match: { studentId: { $in: dept.students } } },
        { $sort: { date: -1 } },
        { $group: {
            _id: '$studentId',
            latestSignal: { $first: '$$ROOT' }
          }
        }
      ]);
      
      let high = 0, medium = 0, low = 0;
      latestSignals.forEach(s => {
        const risk = s.latestSignal.riskLevel;
        if (risk === 'high') high++;
        else if (risk === 'medium') medium++;
        else low++;
      });
      
      dept.riskDistribution = { high, medium, low };
      delete dept.students; // Remove student IDs from response
    }
    
    res.json(departments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get trend data for charts
router.get('/analytics/trends', authMiddleware, checkPermission('viewAnalytics'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Daily burnout risk trends
    const signals = await Signal.aggregate([
      { $match: { date: { $gte: startDate } } },
      { $group: {
          _id: { 
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            riskLevel: '$riskLevel'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);
    
    // Daily average workload
    const workload = await WorkloadScore.aggregate([
      { $match: { date: { $gte: startDate } } },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          avgDaily: { $avg: '$dailyScore' },
          avgWeekly: { $avg: '$weeklyScore' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);
    
    res.json({
      burnoutTrends: signals,
      workloadTrends: workload
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ USER MANAGEMENT ============

// Get all users with filters
router.get('/users', authMiddleware, checkPermission('manageUsers'), async (req, res) => {
  try {
    const { role, department, isActive } = req.query;
    
    const query = {};
    if (role) query.role = role;
    if (department) query.department = department;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user (activate/deactivate, change role, etc.)
router.put('/users/:id', authMiddleware, checkPermission('manageUsers'), async (req, res) => {
  try {
    const { isActive, department, semester, adminLevel, permissions } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (isActive !== undefined) user.isActive = isActive;
    if (department) user.department = department;
    if (semester) user.semester = semester;
    if (adminLevel && user.role === 'admin') user.adminLevel = adminLevel;
    if (permissions && user.role === 'admin') {
      user.permissions = { ...user.permissions, ...permissions };
    }
    
    await user.save();
    
    const updatedUser = user.toObject();
    delete updatedUser.password;
    
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/users/:id', authMiddleware, checkPermission('manageUsers'), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // TODO: Also delete related data (tasks, grades, signals, etc.)
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PROCTOR MANAGEMENT ============

// Get all proctors with their assigned students
router.get('/proctors', authMiddleware, checkPermission('manageProctors'), async (req, res) => {
  try {
    const proctors = await User.find({ role: 'proctor' })
      .select('-password')
      .populate('assignedStudents', 'name email rollNumber department semester');
    
    res.json(proctors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign students to proctor
router.post('/proctors/:proctorId/assign', authMiddleware, checkPermission('manageProctors'), async (req, res) => {
  try {
    const { studentIds } = req.body;
    
    const proctor = await User.findOne({ 
      _id: req.params.proctorId, 
      role: 'proctor' 
    });
    
    if (!proctor) {
      return res.status(404).json({ error: 'Proctor not found' });
    }
    
    // Add new students to assigned list (avoid duplicates)
    const newStudents = studentIds.filter(id => 
      !proctor.assignedStudents.includes(id)
    );
    
    proctor.assignedStudents.push(...newStudents);
    await proctor.save();
    
    await proctor.populate('assignedStudents', 'name email rollNumber department');
    
    res.json({
      message: `${newStudents.length} students assigned`,
      proctor: proctor.toObject()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove student from proctor
router.delete('/proctors/:proctorId/students/:studentId', authMiddleware, checkPermission('manageProctors'), async (req, res) => {
  try {
    const proctor = await User.findOne({ 
      _id: req.params.proctorId, 
      role: 'proctor' 
    });
    
    if (!proctor) {
      return res.status(404).json({ error: 'Proctor not found' });
    }
    
    proctor.assignedStudents = proctor.assignedStudents.filter(
      id => id.toString() !== req.params.studentId
    );
    
    await proctor.save();
    
    res.json({ message: 'Student removed from proctor' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;