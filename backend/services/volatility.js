const WorkloadScore = require('../models/WorkloadScore');
const { VOLATILITY_SPIKE_THRESHOLD } = require('../config/constants');

// Detect sudden workload spikes
async function detectVolatility(studentId) {
  try {
    // Get last 4 weeks of data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 28);

    const scores = await WorkloadScore.find({
      studentId,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: -1 });

    if (scores.length < 7) {
      return { hasVolatility: false };
    }

    // Group by week
    const weeklyScores = {};
    scores.forEach(score => {
      const key = `${score.year}-W${score.weekNumber}`;
      if (!weeklyScores[key]) {
        weeklyScores[key] = score.weeklyScore;
      }
    });

    const weeks = Object.values(weeklyScores);
    
    if (weeks.length < 2) {
      return { hasVolatility: false };
    }

    // Compare current week with previous weeks
    const currentWeek = weeks[0];
    const previousWeek = weeks[1];
    
    if (previousWeek === 0) {
      return { hasVolatility: false };
    }

    const percentageChange = (currentWeek - previousWeek) / previousWeek;
    
    if (percentageChange >= VOLATILITY_SPIKE_THRESHOLD) {
      let severity = 'low';
      if (percentageChange >= 1.0) severity = 'high';
      else if (percentageChange >= 0.75) severity = 'medium';
      
      return {
        hasVolatility: true,
        severity,
        currentWeek,
        previousWeek,
        spikePercentage: Math.round(percentageChange * 100)
      };
    }

    return { hasVolatility: false };
  } catch (error) {
    console.error('Volatility detection error:', error);
    throw error;
  }
}

module.exports = {
  detectVolatility
};