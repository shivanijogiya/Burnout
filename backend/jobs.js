const cron = require('node-cron');
const User = require('./models/User');
const { calculateWorkloadScores } = require('./services/workload');
const { updatePersonalThresholds, predictBurnout } = require('./services/burnout');

// Run daily analysis at 2 AM
function startDailyAnalysis() {
  cron.schedule('0 2 * * *', async () => {
    console.log('Running daily burnout analysis...');
    
    try {
      // Get all students
      const students = await User.find({ role: 'student' });

      for (const student of students) {
        try {
          // Calculate workload for last 7 days
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
          
          await calculateWorkloadScores(student._id, startDate, endDate);

          // Update personal thresholds
          await updatePersonalThresholds(student._id);

          // Run burnout prediction
          await predictBurnout(student._id);

          console.log(`Analyzed student: ${student.name}`);
        } catch (error) {
          console.error(`Error analyzing student ${student._id}:`, error);
        }
      }

      console.log('Daily analysis completed');
    } catch (error) {
      console.error('Daily analysis error:', error);
    }
  });

  console.log('Daily analysis cron job scheduled');
}

module.exports = { startDailyAnalysis };