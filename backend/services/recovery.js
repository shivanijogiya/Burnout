const WorkloadScore = require('../models/WorkloadScore');
const { RECOVERY_GAP_DAYS, LOW_LOAD_THRESHOLD } = require('../config/constants');

// Detect continuous overwork without recovery
async function analyzeRecoveryGap(studentId) {
  try {
    // Get last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const scores = await WorkloadScore.find({
      studentId,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    if (scores.length < 7) {
      return { hasRecoveryDeficit: false };
    }

    // Find continuous high-load streaks
    let currentStreak = 0;
    let maxStreak = 0;
    let lastRestDay = null;

    scores.forEach((score, index) => {
      if (score.dailyScore <= LOW_LOAD_THRESHOLD) {
        // Rest day found
        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
        }
        currentStreak = 0;
        lastRestDay = score.date;
      } else {
        // High load day
        currentStreak++;
      }
    });

    // Check final streak
    if (currentStreak > maxStreak) {
      maxStreak = currentStreak;
    }

    // Calculate days since last rest
    let daysSinceRest = 0;
    if (lastRestDay) {
      daysSinceRest = Math.floor((endDate - lastRestDay) / (1000 * 60 * 60 * 24));
    } else {
      daysSinceRest = scores.length;
    }

    const hasRecoveryDeficit = daysSinceRest >= RECOVERY_GAP_DAYS;

    return {
      hasRecoveryDeficit,
      continuousWorkStreak: daysSinceRest,
      maxStreak,
      lastRestDay
    };
  } catch (error) {
    console.error('Recovery analysis error:', error);
    throw error;
  }
}

module.exports = {
  analyzeRecoveryGap
};