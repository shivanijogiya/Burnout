const Groq = require('groq-sdk');
const User = require('../models/User');
const Task = require('../models/Task');
const Grade = require('../models/Grade');
const CalendarEvent = require('../models/CalendarEvent');

// ============================================
// PUT YOUR GROQ API KEY HERE (Get from https://console.groq.com/)
// ============================================
const GROQ_API_KEY = 'YOUR_GROQ_API_KEY_HERE'; // ← REPLACE THIS

// Initialize Groq client
let groq = null;
try {
  if (GROQ_API_KEY && GROQ_API_KEY !== 'YOUR_GROQ_API_KEY_HERE') {
    groq = new Groq({ apiKey: GROQ_API_KEY });
    console.log('✓ Groq AI enabled');
  } else {
    console.log('⚠️ Groq API key not set - AI recommendations will use fallback mode');
    console.log('   Get your key from: https://console.groq.com/');
  }
} catch (error) {
  console.error('Groq initialization error:', error.message);
  groq = null;
}

// ============================================
// ML-BASED RECOMMENDATIONS (Rule-Based)
// ============================================
async function generateMLRecommendations(studentId, burnoutAnalysis) {
  const recommendations = [];
  const { risk, score, signals } = burnoutAnalysis;

  // COLLISION-BASED RECOMMENDATIONS
  if (signals?.collision?.hasCollision) {
    const taskCount = signals.collision.totalUpcomingTasks || 0;
    const eventCount = signals.collision.totalUpcomingEvents || 0;
    const totalItems = taskCount + eventCount;

    recommendations.push({
      title: '🚨 Deadline Overload Detected',
      priority: 'critical',
      category: 'time_management',
      description: `You have ${totalItems} major deadlines/events (${taskCount} tasks, ${eventCount} events) approaching in the next 2 weeks. This concentration can lead to burnout.`,
      actions: [
        'Break down large tasks into smaller subtasks with intermediate deadlines',
        'Delegate or seek help for non-critical assignments',
        'Contact course instructors early if you need deadline extensions',
        'Use VIT\'s academic support services (Student Welfare Office)',
        'Consider dropping optional events to focus on critical exams'
      ]
    });
  }

  // VOLATILITY-BASED RECOMMENDATIONS
  if (signals?.volatility?.hasVolatility) {
    const severity = signals.volatility.severity;
    const spike = signals.volatility.spikePercentage;

    let priority = 'medium';
    if (severity === 'high') priority = 'critical';
    else if (severity === 'medium') priority = 'high';

    recommendations.push({
      title: '📈 Sudden Workload Spike',
      priority,
      category: 'workload_balance',
      description: `Your workload increased by ${spike}% compared to last week. Sudden spikes are major burnout triggers.`,
      actions: [
        'Prioritize tasks using Eisenhower Matrix (Urgent vs Important)',
        'Identify which tasks can be postponed or eliminated',
        'Set realistic daily goals - don\'t overcommit',
        'Use the Pomodoro Technique (25 min focus, 5 min break)',
        'Track your actual time spent vs estimated to improve planning'
      ]
    });
  }

  // RECOVERY DEFICIT RECOMMENDATIONS
  if (signals?.recovery?.hasRecoveryDeficit) {
    const streak = signals.recovery.continuousWorkStreak;

    recommendations.push({
      title: '🛑 Critical Recovery Needed',
      priority: 'critical',
      category: 'rest_recovery',
      description: `You haven't had a proper rest day in ${streak} days. Continuous work without recovery leads to burnout and decreased performance.`,
      actions: [
        'Schedule at least one complete rest day this week',
        'Practice 20-minute power naps between study sessions',
        'Engage in physical activity - use VIT\'s gym or sports facilities',
        'Maintain 7-8 hours of sleep per night',
        'Try meditation or yoga - join VIT\'s Yoga Club'
      ]
    });
  }

  // PERFORMANCE DRIFT RECOMMENDATIONS
  if (signals?.drift?.hasDrift) {
    const severity = signals.drift.severity;

    let priority = 'medium';
    if (severity === 'severe') priority = 'critical';
    else if (severity === 'moderate') priority = 'high';

    recommendations.push({
      title: '📉 Performance Declining Despite High Effort',
      priority,
      category: 'academic_support',
      description: 'Your grades are declining even though you\'re working hard. This indicates ineffective study methods or excessive stress.',
      actions: [
        'Schedule meeting with your proctor to discuss academic struggles',
        'Attend VIT\'s peer tutoring sessions for difficult subjects',
        'Join study groups - collaborative learning is more effective',
        'Review your study techniques - active recall vs passive reading',
        'Consider reducing course load if consistently overwhelmed'
      ]
    });
  }

  // GENERAL PREVENTIVE RECOMMENDATIONS
  if (risk === 'medium' || risk === 'high') {
    recommendations.push({
      title: '🧠 Mental Health Support',
      priority: risk === 'high' ? 'high' : 'medium',
      category: 'mental_health',
      description: 'Your burnout risk is elevated. Consider seeking mental health support to prevent escalation.',
      actions: [
        'Book free counseling session at VIT Counseling Center',
        'Talk to trusted friends, family, or mentors about your stress',
        'Practice stress management: deep breathing, journaling, mindfulness',
        'Limit caffeine and maintain healthy eating habits',
        'Set boundaries - learn to say no to non-essential commitments'
      ]
    });
  }

  // LOW RISK - MAINTENANCE RECOMMENDATIONS
  if (risk === 'low' && recommendations.length === 0) {
    recommendations.push({
      title: '✅ Keep Up the Good Work!',
      priority: 'low',
      category: 'maintenance',
      description: 'Your burnout risk is currently low. Focus on maintaining healthy habits.',
      actions: [
        'Continue your current workload management strategies',
        'Maintain regular sleep schedule and exercise routine',
        'Keep tracking your tasks and deadlines consistently',
        'Stay connected with peers and participate in campus activities',
        'Review and adjust your schedule weekly'
      ]
    });
  }

  return {
    studentId,
    generatedAt: new Date(),
    burnoutRisk: risk,
    burnoutScore: score,
    recommendations
  };
}

// ============================================
// GROQ AI-POWERED RECOMMENDATIONS
// ============================================
async function generateGroqRecommendations(studentId, burnoutAnalysis) {
  // If Groq is not initialized, return fallback recommendations
  if (!groq) {
    console.log('⚠️ Groq not available - using fallback recommendations');
    return {
      studentId,
      generatedAt: new Date(),
      burnoutRisk: burnoutAnalysis.risk,
      burnoutScore: burnoutAnalysis.score,
      recommendations: generateFallbackRecommendations(burnoutAnalysis),
      note: 'Using fallback recommendations - Add GROQ_API_KEY to enable AI-powered advice'
    };
  }

  try {
    // Fetch additional student context
    const [user, recentTasks, recentGrades, upcomingEvents] = await Promise.all([
      User.findById(studentId),
      Task.find({ studentId }).sort({ deadline: 1 }).limit(10),
      Grade.find({ studentId }).sort({ date: -1 }).limit(5),
      CalendarEvent.find({
        $or: [
          { studentId },
          { isInstitutional: true }
        ],
        date: { $gte: new Date() }
      }).sort({ date: 1 }).limit(10)
    ]);

    // Build context for Groq
    const context = buildGroqContext(user, burnoutAnalysis, recentTasks, recentGrades, upcomingEvents);

    // Call Groq API
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are an expert academic counselor and burnout prevention specialist at VIT (Vellore Institute of Technology), India. 

Your role is to provide personalized, actionable recommendations to help VIT students prevent burnout and improve their academic performance.

IMPORTANT GUIDELINES:
1. Provide 2-4 specific, actionable recommendations based on the student's burnout analysis
2. Each recommendation should include:
   - A clear title
   - Priority level (critical/high/medium/low)
   - Detailed description
   - 3-5 concrete action steps
   - Timeline for implementation
   - Specific VIT resources (counseling center, library, sports facilities, student clubs, academic support)
3. Be empathetic but direct
4. Focus on practical solutions tailored to VIT campus life
5. Consider Indian academic culture and VIT-specific challenges
6. Reference VIT facilities: Library, Gym, Counseling Center (AB2 Building), Student Welfare Office, Peer Tutoring, Sports Clubs

YOU MUST RESPOND WITH VALID JSON ONLY. Format:
{
  "recommendations": [
    {
      "title": "Brief actionable title",
      "priority": "critical|high|medium|low",
      "category": "time_management|workload_balance|rest_recovery|academic_support|mental_health",
      "description": "Detailed explanation of the issue and why it matters",
      "actionSteps": ["Specific action 1", "Specific action 2", "Specific action 3"],
      "timeline": "When to implement (e.g., 'Today', 'This week', 'Within 3 days')",
      "vitResources": "Specific VIT resources, contact info, or locations"
    }
  ]
}`
        },
        {
          role: 'user',
          content: context
        }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 2000
    });

    // Parse Groq response
    const responseText = completion.choices[0]?.message?.content;
    
    console.log('Groq raw response:', responseText);

    let recommendations;
    try {
      // Try to extract JSON from response
      let jsonText = responseText.trim();
      
      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '');
      }
      
      const parsed = JSON.parse(jsonText);
      recommendations = parsed.recommendations || parsed;
      
      // Ensure it's an array
      if (!Array.isArray(recommendations)) {
        recommendations = [recommendations];
      }
    } catch (parseError) {
      console.error('Groq response parse error:', parseError);
      console.log('Failed to parse:', responseText);
      
      // Fallback to basic recommendation
      recommendations = [{
        title: 'AI Analysis Available',
        priority: 'medium',
        category: 'general',
        description: 'Our AI system has analyzed your situation. Please consult with your proctor for personalized guidance.',
        actionSteps: [
          'Schedule meeting with your proctor',
          'Review your current workload and priorities',
          'Seek support from VIT Student Welfare Office'
        ],
        timeline: 'This week',
        vitResources: 'Contact Student Welfare Office (SWO) at Tower Block'
      }];
    }

    return {
      studentId,
      generatedAt: new Date(),
      burnoutRisk: burnoutAnalysis.risk,
      burnoutScore: burnoutAnalysis.score,
      recommendations
    };

  } catch (error) {
    console.error('Groq API error:', error);
    
    // Return fallback recommendations
    return {
      studentId,
      generatedAt: new Date(),
      burnoutRisk: burnoutAnalysis.risk,
      burnoutScore: burnoutAnalysis.score,
      recommendations: generateFallbackRecommendations(burnoutAnalysis)
    };
  }
}

// ============================================
// BUILD CONTEXT FOR GROQ
// ============================================
function buildGroqContext(user, burnoutAnalysis, tasks, grades, events) {
  const { risk, score, signals, reasons } = burnoutAnalysis;

  let context = `STUDENT PROFILE:
- Name: ${user?.name || 'Student'}
- Department: ${user?.department || 'Not specified'}
- Semester: ${user?.semester || 'Not specified'}
- Current Burnout Risk: ${risk.toUpperCase()} (Score: ${score}/100)

BURNOUT ANALYSIS:
- Risk Level: ${risk}
- Overall Score: ${score}/100
- Contributing Factors: ${reasons.join('; ')}

SIGNALS DETECTED:
`;

  if (signals?.collision?.hasCollision) {
    context += `- ⚠️ COLLISION: ${signals.collision.totalUpcomingTasks || 0} tasks + ${signals.collision.totalUpcomingEvents || 0} events in next 2 weeks\n`;
  }
  
  if (signals?.volatility?.hasVolatility) {
    context += `- 📈 VOLATILITY: ${signals.volatility.spikePercentage}% workload increase (${signals.volatility.severity} severity)\n`;
  }
  
  if (signals?.recovery?.hasRecoveryDeficit) {
    context += `- 🛑 RECOVERY DEFICIT: ${signals.recovery.continuousWorkStreak} days without rest\n`;
  }
  
  if (signals?.drift?.hasDrift) {
    context += `- 📉 PERFORMANCE DRIFT: Grades declining despite effort (${signals.drift.severity})\n`;
  }

  context += `\nUPCOMING TASKS (${tasks.length}):
`;
  tasks.slice(0, 5).forEach(task => {
    const deadline = new Date(task.deadline).toLocaleDateString('en-IN');
    context += `- ${task.title} (${task.type}) - Due: ${deadline}, Effort: ${task.estimatedEffort}h\n`;
  });

  context += `\nRECENT GRADES (${grades.length}):
`;
  grades.slice(0, 3).forEach(grade => {
    const percentage = ((grade.marks / grade.maxMarks) * 100).toFixed(1);
    context += `- ${grade.subject}: ${percentage}% (${grade.examType})\n`;
  });

  context += `\nUPCOMING EVENTS (${events.length}):
`;
  events.slice(0, 5).forEach(event => {
    const date = new Date(event.date).toLocaleDateString('en-IN');
    context += `- ${event.title} (${event.eventType}) - ${date}\n`;
  });

  context += `\nBased on this analysis, provide personalized, actionable recommendations to help this VIT student prevent burnout. Focus on specific steps they can take immediately using VIT resources.`;

  return context;
}

// ============================================
// FALLBACK RECOMMENDATIONS (IF GROQ FAILS)
// ============================================
function generateFallbackRecommendations(burnoutAnalysis) {
  const { risk, score } = burnoutAnalysis;

  const recommendations = [];

  if (risk === 'high') {
    recommendations.push({
      title: '🚨 Immediate Action Required',
      priority: 'critical',
      category: 'urgent',
      description: 'Your burnout risk is critically high. Take immediate steps to reduce your workload and stress.',
      actionSteps: [
        'Contact your proctor immediately to discuss your situation',
        'Visit VIT Counseling Center for professional support',
        'Identify non-essential commitments you can postpone or eliminate',
        'Schedule at least one complete rest day this week',
        'Reach out to friends or family for emotional support'
      ],
      timeline: 'Today',
      vitResources: 'VIT Counseling Center: AB2 Building, +91-416-220-2525'
    });
  } else if (risk === 'medium') {
    recommendations.push({
      title: '⚠️ Take Preventive Action',
      priority: 'high',
      category: 'prevention',
      description: 'Your burnout risk is elevated. Act now to prevent it from escalating.',
      actionSteps: [
        'Review and prioritize your upcoming deadlines',
        'Schedule regular breaks and rest periods',
        'Seek help from peers or tutors for difficult subjects',
        'Maintain healthy sleep and eating habits',
        'Consider attending stress management workshops'
      ],
      timeline: 'This week',
      vitResources: 'Student Welfare Office (SWO) at Tower Block'
    });
  } else {
    recommendations.push({
      title: '✅ Maintain Healthy Balance',
      priority: 'low',
      category: 'maintenance',
      description: 'Your burnout risk is currently low. Keep up your good habits!',
      actionSteps: [
        'Continue your current workload management approach',
        'Stay consistent with sleep and exercise routines',
        'Keep tracking tasks and planning ahead',
        'Stay connected with campus activities',
        'Monitor your stress levels regularly'
      ],
      timeline: 'Ongoing',
      vitResources: 'Join VIT clubs for balanced campus life'
    });
  }

  return recommendations;
}

module.exports = {
  generateMLRecommendations,
  generateGroqRecommendations
};