const Task = require('../models/Task');
const CalendarEvent = require('../models/CalendarEvent');
const WorkloadScore = require('../models/WorkloadScore');
const { WEIGHTS } = require('../config/constants');

// Event type weights (higher = more stressful)
const EVENT_WEIGHTS = {
  'exam': 8,          // Very high stress, like multiple exam tasks
  'registration': 4,  // Moderate effort, decision-making
  'event': 3,         // General attendance
  'holiday': 0        // Rest day, no workload
};

// Get week number from date
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

// Calculate workload from calendar event
function calculateEventWorkload(event) {
  const eventType = event.eventType || event.type || 'event';
  const weight = EVENT_WEIGHTS[eventType.toLowerCase()] || EVENT_WEIGHTS['event'];
  
  // Estimate duration (hours) - use provided duration or default
  const duration = event.duration || 3;
  
  return weight * duration;
}

// Calculate workload scores for a student (UPDATED TO INCLUDE EVENTS)
async function calculateWorkloadScores(studentId, startDate, endDate) {
  try {
    // ============================================
    // FETCH BOTH TASKS AND CALENDAR EVENTS
    // ============================================
    
    // Get all tasks in date range
    const tasks = await Task.find({
      studentId,
      deadline: { $gte: startDate, $lte: endDate }
    });

    // Get all calendar events in date range
    // Include both personal events AND institutional events
    const events = await CalendarEvent.find({
      $or: [
        { createdBy: studentId, isInstitutional: false },  // Personal events
        { isInstitutional: true }                           // Institutional events (visible to all)
      ],
      startDate: { $gte: startDate, $lte: endDate }
    });

    console.log(`Calculating workload for student ${studentId}:`);
    console.log(`- Tasks found: ${tasks.length}`);
    console.log(`- Events found: ${events.length}`);

    // ============================================
    // GROUP TASKS BY DAY AND CALCULATE WORKLOAD
    // ============================================
    const dailyScores = {};
    
    // Process tasks
    tasks.forEach(task => {
      const dateKey = task.deadline.toISOString().split('T')[0];
      
      if (!dailyScores[dateKey]) {
        dailyScores[dateKey] = {
          taskScore: 0,
          eventScore: 0,
          totalHours: 0,
          taskCount: 0,
          eventCount: 0
        };
      }
      
      // Apply weight multiplier for tasks
      const weight = WEIGHTS[task.type] || WEIGHTS.default;
      const weightedEffort = task.estimatedEffort * weight;
      
      dailyScores[dateKey].taskScore += weightedEffort;
      dailyScores[dateKey].totalHours += task.estimatedEffort;
      dailyScores[dateKey].taskCount += 1;
    });

    // Process calendar events
    events.forEach(event => {
      const dateKey = event.startDate.toISOString().split('T')[0];
      
      if (!dailyScores[dateKey]) {
        dailyScores[dateKey] = {
          taskScore: 0,
          eventScore: 0,
          totalHours: 0,
          taskCount: 0,
          eventCount: 0
        };
      }
      
      // Calculate event workload
      const eventWorkload = calculateEventWorkload(event);
      
      dailyScores[dateKey].eventScore += eventWorkload;
      dailyScores[dateKey].eventCount += 1;
    });

    // ============================================
    // SAVE DAILY SCORES TO DATABASE
    // ============================================
    for (const [dateStr, data] of Object.entries(dailyScores)) {
      const date = new Date(dateStr);
      const weekNumber = getWeekNumber(date);
      
      // Total daily score = task workload + event workload
      const dailyScore = data.taskScore + data.eventScore;
      
      await WorkloadScore.findOneAndUpdate(
        { studentId, date },
        {
          dailyScore: dailyScore,
          taskScore: data.taskScore,      // NEW: separate task score
          eventScore: data.eventScore,    // NEW: separate event score
          taskCount: data.taskCount,
          eventCount: data.eventCount,    // NEW: count of events
          weekNumber,
          year: date.getFullYear(),
          calculatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      console.log(`Date ${dateStr}: Task=${data.taskScore}, Event=${data.eventScore}, Total=${dailyScore}`);
    }

    // ============================================
    // CALCULATE WEEKLY SCORES
    // ============================================
    await calculateWeeklyScores(studentId, startDate, endDate);

    return { success: true };
  } catch (error) {
    console.error('Workload calculation error:', error);
    throw error;
  }
}

// Calculate weekly aggregates
async function calculateWeeklyScores(studentId, startDate, endDate) {
  const scores = await WorkloadScore.find({
    studentId,
    date: { $gte: startDate, $lte: endDate }
  });

  // Group by week
  const weeklyData = {};
  
  scores.forEach(score => {
    const key = `${score.year}-W${score.weekNumber}`;
    if (!weeklyData[key]) {
      weeklyData[key] = { total: 0, dates: [] };
    }
    weeklyData[key].total += score.dailyScore;
    weeklyData[key].dates.push(score.date);
  });

  // Update weekly scores
  for (const [weekKey, data] of Object.entries(weeklyData)) {
    for (const date of data.dates) {
      await WorkloadScore.findOneAndUpdate(
        { studentId, date },
        { weeklyScore: data.total }
      );
    }
  }
}

// Get workload data for display
async function getWorkloadData(studentId, days = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const scores = await WorkloadScore.find({
    studentId,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 });

  return scores.map(score => ({
    date: score.date,
    dailyScore: score.dailyScore || 0,
    taskScore: score.taskScore || 0,
    eventScore: score.eventScore || 0,
    taskCount: score.taskCount || 0,
    eventCount: score.eventCount || 0,
    weeklyScore: score.weeklyScore || 0,
    weekNumber: score.weekNumber,
    year: score.year
  }));
}

module.exports = {
  calculateWorkloadScores,
  getWorkloadData,
  getWeekNumber,
  calculateEventWorkload,  // Export for use in other services
  EVENT_WEIGHTS            // Export for reference
};