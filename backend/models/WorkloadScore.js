const mongoose = require('mongoose');

const workloadScoreSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  // UPDATED: Separate task and event scores
  dailyScore: {
    type: Number,
    default: 0,
    comment: 'Total workload score (taskScore + eventScore)'
  },
  taskScore: {
    type: Number,
    default: 0,
    comment: 'Workload from tasks only'
  },
  eventScore: {
    type: Number,
    default: 0,
    comment: 'Workload from calendar events only'
  },
  weeklyScore: {
    type: Number,
    default: 0
  },
  // UPDATED: Separate counts
  taskCount: {
    type: Number,
    default: 0,
    comment: 'Number of tasks on this date'
  },
  eventCount: {
    type: Number,
    default: 0,
    comment: 'Number of calendar events on this date'
  },
  weekNumber: {
    type: Number,
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  calculatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index for faster queries
workloadScoreSchema.index({ studentId: 1, date: 1 }, { unique: true });
workloadScoreSchema.index({ studentId: 1, weekNumber: 1, year: 1 });

module.exports = mongoose.model('WorkloadScore', workloadScoreSchema);