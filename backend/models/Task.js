const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['exam', 'project', 'assignment', 'quiz', 'placement', 'hackathon', 'other'],
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  deadline: {
    type: Date,
    required: true
  },
  estimatedEffort: {
    type: Number, // in hours
    required: true
  },
  weight: {
    type: Number, // auto-calculated based on type
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
taskSchema.index({ studentId: 1, deadline: 1 });

module.exports = mongoose.model('Task', taskSchema);