const Grade = require('../models/Grade');
const WorkloadScore = require('../models/WorkloadScore');
const { DRIFT_PERIODS } = require('../config/constants');

// Detect "working harder but scoring worse"
async function analyzePerformanceDrift(studentId) {
  try {
    // Get last 6 months of data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6);

    // Get grades
    const grades = await Grade.find({
      studentId,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    if (grades.length < DRIFT_PERIODS) {
      return { hasDrift: false };
    }

    // Get workload scores for same period
    const workloadScores = await WorkloadScore.find({
      studentId,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    if (workloadScores.length === 0) {
      return { hasDrift: false };
    }

    // Group by month
    const monthlyData = {};
    
    grades.forEach(grade => {
      const monthKey = `${grade.date.getFullYear()}-${grade.date.getMonth() + 1}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { grades: [], effort: 0 };
      }
      monthlyData[monthKey].grades.push(grade.percentage);
    });

    workloadScores.forEach(score => {
      const monthKey = `${score.date.getFullYear()}-${score.date.getMonth() + 1}`;
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].effort += score.weeklyScore;
      }
    });

    // Calculate averages per month
    const months = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        avgGrade: data.grades.reduce((a, b) => a + b, 0) / data.grades.length,
        totalEffort: data.effort
      }))
      .filter(m => m.avgGrade && m.totalEffort);

    if (months.length < DRIFT_PERIODS) {
      return { hasDrift: false };
    }

    // Check for sustained drift (effort up, grades down)
    let driftCount = 0;
    
    for (let i = 1; i < months.length; i++) {
      const prev = months[i - 1];
      const curr = months[i];
      
      if (curr.totalEffort > prev.totalEffort && curr.avgGrade < prev.avgGrade) {
        driftCount++;
      }
    }

    const hasDrift = driftCount >= DRIFT_PERIODS - 1;
    
    let severity = 'mild';
    if (driftCount >= 4) severity = 'severe';
    else if (driftCount >= 3) severity = 'moderate';

    return {
      hasDrift,
      severity,
      driftPeriods: driftCount,
      recentData: months.slice(-3)
    };
  } catch (error) {
    console.error('Drift analysis error:', error);
    throw error;
  }
}

module.exports = {
  analyzePerformanceDrift
};