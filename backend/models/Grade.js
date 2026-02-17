const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  examType: {
    type: String,
    enum: ['cat1', 'cat2', 'mid-term', 'final', 'quiz', 'assignment', 'course-project'],
    required: true
  },
  marks: {
    type: Number,
    required: true
  },
  maxMarks: {
    type: Number,
    required: true
  },
  percentage: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  semester: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for performance tracking
gradeSchema.index({ studentId: 1, date: 1 });

module.exports = mongoose.model('Grade', gradeSchema);