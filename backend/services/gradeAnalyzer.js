const Grade = require('../models/Grade');

async function analyzeGrades(studentId) {
  try {
    const grades = await Grade.find({ studentId }).sort({ date: -1 }).limit(20);
    
    if (grades.length === 0) {
      return {
        hasLowGrades: false,
        riskScore: 0,
        avgPercentage: 0,
        message: '',
        strugglingSubjects: [],
        recommendations: []
      };
    }

    const avgPercentage = grades.reduce((sum, g) => sum + g.percentage, 0) / grades.length;
    const strugglingSubjects = grades.filter(g => g.percentage < 60);
    const recentDecline = checkRecentDecline(grades);

    let riskScore = 0;
    let message = '';
    const recommendations = [];

    // Low average → Need more study time
    if (avgPercentage < 60) {
      riskScore += 15;
      message = `Average grade ${avgPercentage.toFixed(0)}% - Need focused study time`;
      recommendations.push('Allocate 2-3 hours daily for weak subjects');
      recommendations.push('Seek tutoring or study groups');
      recommendations.push('Break study sessions into 25-minute focused intervals');
    }
    
    // ✅ UPDATED: More aggressive struggling subject detection
    if (strugglingSubjects.length >= 2) {
      riskScore += 15;  // Increased from 10
      message = `${strugglingSubjects.length} subjects below 60% - Immediate attention needed`;
      const subjectList = strugglingSubjects.map(s => s.subject).join(', ');
      recommendations.push(`Critical subjects: ${subjectList}`);
      recommendations.push('Schedule extra practice sessions for weak subjects');
      recommendations.push('Meet with professors during office hours');
    } else if (strugglingSubjects.length === 1) {
      riskScore += 10;
      recommendations.push(`Focus on: ${strugglingSubjects[0].subject}`);
    }

    // Recent decline → Warning sign
    if (recentDecline) {
      riskScore += 15;
      message = 'Grades declining - Reduce workload or seek help';
      recommendations.push('Review recent study habits and identify issues');
      recommendations.push('Consider dropping non-essential activities');
      recommendations.push('Meet with academic advisor');
    }

    // High grades → Can relax
    if (avgPercentage > 80 && strugglingSubjects.length === 0) {
      riskScore = -5;
      message = 'Strong academic performance - Maintain balance';
      recommendations.push('You can afford a lighter study schedule');
      recommendations.push('Focus on maintaining work-life balance');
      recommendations.push('Continue current study methods');
    }

    return {
      hasLowGrades: avgPercentage < 60 || strugglingSubjects.length >= 2,
      riskScore,
      message,
      avgPercentage: parseFloat(avgPercentage.toFixed(1)),
      strugglingSubjects: strugglingSubjects.map(g => ({
        subject: g.subject,
        percentage: parseFloat(g.percentage.toFixed(1)),
        examType: g.examType
      })),
      recommendations
    };
  } catch (error) {
    console.error('Grade analysis error:', error);
    return {
      hasLowGrades: false,
      riskScore: 0,
      avgPercentage: 0,
      message: '',
      strugglingSubjects: [],
      recommendations: []
    };
  }
}

function checkRecentDecline(grades) {
  if (grades.length < 6) return false;
  
  const recent = grades.slice(0, 3);
  const older = grades.slice(3, 6);
  
  if (recent.length === 0 || older.length === 0) return false;
  
  const recentAvg = recent.reduce((sum, g) => sum + g.percentage, 0) / recent.length;
  const olderAvg = older.reduce((sum, g) => sum + g.percentage, 0) / older.length;
  
  return recentAvg < olderAvg - 10;
}

module.exports = { analyzeGrades };