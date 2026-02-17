module.exports = {
  // Workload Thresholds
  SAFE_WEEKLY_LIMIT: 40, // hours
  COLLISION_TASK_COUNT: 3, // major tasks
  COLLISION_HOUR_LIMIT: 50, // hours per week
  
  // Volatility
  VOLATILITY_SPIKE_THRESHOLD: 0.5, // 50% increase
  
  // Recovery
  RECOVERY_GAP_DAYS: 7, // days without rest
  LOW_LOAD_THRESHOLD: 10, // hours (below this = rest day)
  
  // Task Weights
  WEIGHTS: {
    exam: 3,
    project: 2.5,
    assignment: 1.5,
    quiz: 1,
    default: 1
  },
  
  // Burnout Risk Scoring
  BURNOUT_THRESHOLDS: {
    low: 30,
    medium: 60,
    high: 100
  },
  
  // Performance Drift
  DRIFT_PERIODS: 3, // number of periods to check for sustained drift
  
  // Notification Types
  NOTIFICATION_TYPES: {
    OVERLOAD: 'overload',
    HIGH_BURNOUT: 'high_burnout',
    VOLATILITY: 'volatility',
    RECOVERY_DEFICIT: 'recovery_deficit',
    PERFORMANCE_DRIFT: 'performance_drift',
    MENTOR_SUGGESTION: 'mentor_suggestion'
  }
};