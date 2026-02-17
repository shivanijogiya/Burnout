const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✓ MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Import routes
const { router: authRouter } = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const workloadRoutes = require('./routes/workload');
const gradeRoutes = require('./routes/grades');
const calendarRoutes = require('./routes/calendar');
const burnoutRoutes = require('./routes/burnout');
const proctorRoutes = require('./routes/proctor');
const adminRoutes = require('./routes/admin'); // NEW ADMIN ROUTES


// API Routes
app.use('/api/auth', authRouter);
app.use('/api/tasks', taskRoutes);
app.use('/api/workload', workloadRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/burnout', burnoutRoutes);
app.use('/api/proctor', proctorRoutes);
app.use('/api/admin', adminRoutes); // NEW ADMIN ROUTES

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
});

module.exports = app;