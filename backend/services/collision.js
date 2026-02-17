const Task = require('../models/Task');
const CalendarEvent = require('../models/CalendarEvent');
const { COLLISION_TASK_COUNT, COLLISION_HOUR_LIMIT, WEIGHTS } = require('../config/constants');

async function detectCollisions(studentId) {
  try {
    const today = new Date();
    const twoWeeksLater = new Date();
    twoWeeksLater.setDate(today.getDate() + 14);

    const tasks = await Task.find({
      studentId,
      deadline: { $gte: today, $lte: twoWeeksLater },
      completed: false
    }).sort({ deadline: 1 });

    const events = await CalendarEvent.find({
      $or: [
        { createdBy: studentId, isInstitutional: false },
        { isInstitutional: true }
      ],
      startDate: { $gte: today, $lte: twoWeeksLater }
    }).sort({ startDate: 1 });

    console.log(`Collision detection for student ${studentId}:`);
    console.log(`- Upcoming tasks: ${tasks.length}`);
    console.log(`- Upcoming events: ${events.length}`);

    const weeks = {};
    
    tasks.forEach(task => {
      const weekStart = new Date(task.deadline);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weeks[weekKey]) {
        weeks[weekKey] = {
          tasks: [],
          events: [],
          totalHours: 0,
          majorTasks: 0,
          allEvents: 0
        };
      }
      
      weeks[weekKey].tasks.push(task);
      weeks[weekKey].totalHours += task.estimatedEffort;
      
      if (['exam', 'project'].includes(task.type.toLowerCase())) {
        weeks[weekKey].majorTasks++;
      }
    });

    events.forEach(event => {
      const weekStart = new Date(event.startDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weeks[weekKey]) {
        weeks[weekKey] = {
          tasks: [],
          events: [],
          totalHours: 0,
          majorTasks: 0,
          allEvents: 0
        };
      }
      
      weeks[weekKey].events.push(event);
      weeks[weekKey].allEvents++;
      
      const eventHours = event.duration || 3;
      weeks[weekKey].totalHours += eventHours;
    });

    const collisions = [];
    
    for (const [weekStart, data] of Object.entries(weeks)) {
      const totalMajorItems = data.majorTasks + data.allEvents;
      const totalAllItems = data.tasks.length + data.events.length; // ✅ NEW: Count ALL items
      
      // ✅ UPDATED: More aggressive collision detection
      const hasCollision = 
        totalAllItems >= 5 ||        // 5+ total tasks/events in a week
        totalMajorItems >= 2 ||       // 2+ major items (exams/projects/events)
        data.totalHours > COLLISION_HOUR_LIMIT;  // Over hour limit
      
      if (hasCollision) {
        console.log(`✅ Collision detected for week ${weekStart}:`);
        console.log(`  - Total tasks: ${data.tasks.length}`);
        console.log(`  - Total events: ${data.events.length}`);
        console.log(`  - Total items: ${totalAllItems}`);
        console.log(`  - Major tasks: ${data.majorTasks}`);
        console.log(`  - All events: ${data.allEvents}`);
        console.log(`  - Total major items: ${totalMajorItems}`);
        console.log(`  - Total hours: ${data.totalHours}`);
        
        collisions.push({
          weekStart,
          totalHours: data.totalHours,
          majorTasks: data.majorTasks,
          allEvents: data.allEvents,
          totalMajorItems: totalMajorItems,
          totalAllItems: totalAllItems, // ✅ NEW
          tasks: data.tasks.map(t => ({
            id: t._id,
            title: t.title,
            type: t.type,
            deadline: t.deadline,
            effort: t.estimatedEffort
          })),
          events: data.events.map(e => ({
            id: e._id,
            title: e.title,
            type: e.eventType || e.type,
            date: e.startDate,
            isInstitutional: e.isInstitutional
          }))
        });
      }
    }

    return {
      hasCollision: collisions.length > 0,
      collisions,
      totalUpcomingTasks: tasks.length,
      totalUpcomingEvents: events.length
    };
  } catch (error) {
    console.error('Collision detection error:', error);
    throw error;
  }
}

module.exports = {
  detectCollisions
};