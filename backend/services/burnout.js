const Signal = require('../models/Signal');
const User = require('../models/User');
const WorkloadScore = require('../models/WorkloadScore');
const Task = require('../models/Task');
const CalendarEvent = require('../models/CalendarEvent');
const { detectCollisions } = require('./collision');
const { detectVolatility } = require('./volatility');
const { analyzeRecoveryGap } = require('./recovery');
const { analyzePerformanceDrift } = require('./drift');
const { analyzeGrades } = require('./gradeAnalyzer'); // ✅ NEW
const { SAFE_WEEKLY_LIMIT, BURNOUT_THRESHOLDS } = require('../config/constants');
const { generateMLRecommendations, generateGroqRecommendations } = require('./recommendations');

// Build personal thresholds (Feature 7)
async function updatePersonalThresholds(studentId) {
  try {
    // Get last 3 months of workload data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);

    const scores = await WorkloadScore.find({
      studentId,
      date: { $gte: startDate, $lte: endDate }
    });

    if (scores.length < 10) {
      return; // Not enough data
    }

    // Calculate personal baselines
    const weeklyScores = scores.map(s => s.weeklyScore).filter(s => s > 0);
    
    const avgWeekly = weeklyScores.reduce((a, b) => a + b, 0) / weeklyScores.length;
    const maxWeekly = Math.max(...weeklyScores);

    // Update user thresholds
    await User.findByIdAndUpdate(studentId, {
      'personalThresholds.normalWeeklyLoad': Math.round(avgWeekly),
      'personalThresholds.maxWeeklyLoad': Math.round(maxWeekly)
    });
  } catch (error) {
    console.error('Threshold update error:', error);
  }
}

// Main burnout prediction (Feature 8) - UPDATED TO INCLUDE GRADES
async function predictBurnout(studentId) {
  try {
    console.log(`\n========================================`);
    console.log(`BURNOUT PREDICTION FOR STUDENT: ${studentId}`);
    console.log(`========================================\n`);

    // ============================================
    // RUN ALL DETECTORS (NOW INCLUDING GRADES)
    // ============================================
    const [collision, volatility, recovery, drift, gradeAnalysis] = await Promise.all([
      detectCollisions(studentId),        // Tasks + events
      detectVolatility(studentId),        // Workload spikes
      analyzeRecoveryGap(studentId),      // Rest days
      analyzePerformanceDrift(studentId), // Grades vs effort
      analyzeGrades(studentId)            // ✅ NEW: Direct grade analysis
    ]);

    // Get personal thresholds
    const user = await User.findById(studentId);
    const personalMax = user?.personalThresholds?.maxWeeklyLoad || SAFE_WEEKLY_LIMIT;

    // ============================================
    // CALCULATE BURNOUT SCORE (0-100)
    // ============================================
    let score = 0;
    const reasons = [];

    // Collision adds 30 points
    if (collision.hasCollision) {
      score += 30;
      
      const taskCount = collision.totalUpcomingTasks || 0;
      const eventCount = collision.totalUpcomingEvents || 0;
      const totalItems = taskCount + eventCount;
      
      reasons.push(`${totalItems} upcoming deadlines/events detected (${taskCount} tasks, ${eventCount} events)`);
      
      console.log(`✓ COLLISION DETECTED: +30 points`);
      console.log(`  - Tasks: ${taskCount}`);
      console.log(`  - Events: ${eventCount}`);
    }

    // Volatility adds 15-25 points
    if (volatility.hasVolatility) {
      if (volatility.severity === 'high') score += 25;
      else if (volatility.severity === 'medium') score += 20;
      else score += 15;
      
      reasons.push(`Sudden workload spike: ${volatility.spikePercentage}% increase`);
      
      console.log(`✓ VOLATILITY DETECTED: +${volatility.severity === 'high' ? 25 : volatility.severity === 'medium' ? 20 : 15} points`);
      console.log(`  - Spike: ${volatility.spikePercentage}%`);
    }

    // Recovery deficit adds 25 points
    if (recovery.hasRecoveryDeficit) {
      score += 25;
      reasons.push(`No rest for ${recovery.continuousWorkStreak} days`);
      
      console.log(`✓ RECOVERY DEFICIT: +25 points`);
      console.log(`  - Continuous work: ${recovery.continuousWorkStreak} days`);
    }

    // Performance drift adds 10-20 points
    if (drift.hasDrift) {
      if (drift.severity === 'severe') score += 20;
      else if (drift.severity === 'moderate') score += 15;
      else score += 10;
      
      reasons.push(`Performance declining despite high effort`);
      
      console.log(`✓ PERFORMANCE DRIFT: +${drift.severity === 'severe' ? 20 : drift.severity === 'moderate' ? 15 : 10} points`);
      console.log(`  - Severity: ${drift.severity}`);
    }

    // ✅ NEW: Grade-based risk adds up to 40 points (or reduces by 5)
    if (gradeAnalysis.hasLowGrades) {
      score += gradeAnalysis.riskScore;
      reasons.push(gradeAnalysis.message);
      
      console.log(`✓ GRADE RISK DETECTED: +${gradeAnalysis.riskScore} points`);
      console.log(`  - Avg: ${gradeAnalysis.avgPercentage}%`);
      console.log(`  - Struggling subjects: ${gradeAnalysis.strugglingSubjects.length}`);
    } else if (gradeAnalysis.riskScore < 0) {
      score += gradeAnalysis.riskScore; // Can reduce score
      reasons.push(gradeAnalysis.message);
      
      console.log(`✓ STRONG ACADEMIC PERFORMANCE: ${gradeAnalysis.riskScore} points`);
      console.log(`  - Avg: ${gradeAnalysis.avgPercentage}%`);
    }

    // Ensure score doesn't go negative
    score = Math.max(0, score);

    // ============================================
    // DETERMINE RISK LEVEL
    // ============================================
    let risk = 'low';
    if (score >= BURNOUT_THRESHOLDS.high) risk = 'high';
    else if (score >= BURNOUT_THRESHOLDS.medium) risk = 'medium';

    console.log(`\n========================================`);
    console.log(`BURNOUT SCORE: ${score}/100`);
    console.log(`RISK LEVEL: ${risk.toUpperCase()}`);
    console.log(`========================================\n`);

    // ============================================
    // SAVE SIGNAL TO DATABASE
    // ============================================
    const signal = await Signal.create({
      studentId,
      date: new Date(),
      collisionFlag: collision.hasCollision,
      collidingTasks: collision.collisions?.[0]?.tasks?.map(t => t.id) || [],
      volatilityFlag: volatility.hasVolatility,
      volatilitySeverity: volatility.severity || 'low',
      spikePercentage: volatility.spikePercentage || 0,
      recoveryDeficitFlag: recovery.hasRecoveryDeficit,
      continuousWorkStreak: recovery.continuousWorkStreak || 0,
      performanceDriftFlag: drift.hasDrift,
      driftSeverity: drift.severity || 'mild',
      burnoutRisk: risk,
      burnoutScore: score,
      reasonCodes: reasons
    });

    // ============================================
    // RETURN ANALYSIS RESULT
    // ============================================
    return {
      risk,
      score,
      reasons,
      signals: {
        collision,
        volatility,
        recovery,
        drift,
        gradeAnalysis // ✅ NEW: Include grade analysis in response
      },
      signalId: signal._id,
      metadata: {
        upcomingTasks: collision.totalUpcomingTasks || 0,
        upcomingEvents: collision.totalUpcomingEvents || 0,
        avgGrade: gradeAnalysis.avgPercentage || 0,
        strugglingSubjects: gradeAnalysis.strugglingSubjects.length || 0,
        analyzedAt: new Date()
      }
    };
  } catch (error) {
    console.error('Burnout prediction error:', error);
    throw error;
  }
}

// Get personalized recommendations
async function getRecommendations(studentId, burnoutAnalysis) {
  try {
    const [mlRecs, groqRecs] = await Promise.all([
      generateMLRecommendations(studentId, burnoutAnalysis),
      generateGroqRecommendations(studentId, burnoutAnalysis)
    ]);
    
    return {
      mlRecommendations: mlRecs,
      groqRecommendations: groqRecs
    };
  } catch (error) {
    console.error('Get recommendations error:', error);
    throw error;
  }
}

module.exports = {
  updatePersonalThresholds,
  predictBurnout,
  getRecommendations
};