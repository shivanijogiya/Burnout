const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  eventType: {
    type: String,
    enum: ['exam', 'assignment', 'project', 'quiz', 'holiday', 'institutional', 'personal', 'event', 'registration', 'deadline', 'other'],
    default: 'other'
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  // For institutional events created by admin
  isInstitutional: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Target specific departments (empty array = all departments)
  targetDepartments: [{
    type: String,
    enum: ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'OTHER', 'ALL']
  }],
  // Target specific semesters (empty array = all semesters)
  targetSemesters: [{
    type: Number,
    min: 1,
    max: 8
  }],
  // For personal events
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isPersonal: {
    type: Boolean,
    default: false
  },
  venue: String,
  color: {
    type: String,
    default: '#3498db'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
calendarEventSchema.index({ startDate: 1 });
calendarEventSchema.index({ isInstitutional: 1 });
calendarEventSchema.index({ userId: 1 });

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);