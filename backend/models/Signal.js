const mongoose = require('mongoose');

const signalSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  
  // Collision signal
  collisionFlag: {
    type: Boolean,
    default: false
  },
  collidingTasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  
  // Volatility signal
  volatilityFlag: {
    type: Boolean,
    default: false
  },
  volatilitySeverity: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low'
  },
  spikePercentage: Number,
  
  // Recovery signal
  recoveryDeficitFlag: {
    type: Boolean,
    default: false
  },
  continuousWorkStreak: Number,
  
  // Performance drift signal
  performanceDriftFlag: {
    type: Boolean,
    default: false
  },
  driftSeverity: {
    type: String,
    enum: ['mild', 'moderate', 'severe'],
    default: 'mild'
  },
  
  // Overall burnout prediction
  burnoutRisk: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low'
  },
  burnoutScore: {
    type: Number,
    default: 0
  },
  reasonCodes: [String],
  
  notified: {
    type: Boolean,
    default: false
  }
});

// Index for recent signals
signalSchema.index({ studentId: 1, date: -1 });

module.exports = mongoose.model('Signal', signalSchema);