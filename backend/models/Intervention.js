const mongoose = require('mongoose');

const interventionSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  proctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['suggestion', 'warning', 'counseling', 'task-reschedule', 'other'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  relatedSignal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Signal'
  },
  status: {
    type: String,
    enum: ['pending', 'acknowledged', 'resolved'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  acknowledgedAt: Date
});

// Index for proctor dashboard
interventionSchema.index({ studentId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Intervention', interventionSchema);