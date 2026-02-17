const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'proctor', 'admin'],
    required: true
  },
  
  // Student-specific fields
  rollNumber: {
    type: String,
    sparse: true
  },
  department: {
    type: String,
    enum: ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'OTHER']
  },
  semester: {
    type: Number,
    min: 1,
    max: 8
  },
  batch: String,
  
  // Proctor-specific fields
  proctorId: {
    type: String,
    sparse: true
  },
  assignedStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Admin-specific fields
  adminLevel: {
    type: String,
    enum: ['super', 'department', 'limited'],
    default: 'limited'
  },
  permissions: {
    manageCalendar: { type: Boolean, default: false },
    manageUsers: { type: Boolean, default: false },
    viewAnalytics: { type: Boolean, default: false },
    manageProctors: { type: Boolean, default: false },
    manageAdmins: { type: Boolean, default: false },
    exportReports: { type: Boolean, default: false }
  },
  
  // Common fields
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  profilePicture: String,
  phone: String
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Set default permissions based on admin level
userSchema.pre('save', function(next) {
  if (this.role === 'admin' && this.isModified('adminLevel')) {
    switch (this.adminLevel) {
      case 'super':
        this.permissions = {
          manageCalendar: true,
          manageUsers: true,
          viewAnalytics: true,
          manageProctors: true,
          manageAdmins: true,
          exportReports: true
        };
        break;
      case 'department':
        this.permissions = {
          manageCalendar: true,
          manageUsers: true,
          viewAnalytics: true,
          manageProctors: true,
          manageAdmins: false,
          exportReports: true
        };
        break;
      case 'limited':
        this.permissions = {
          manageCalendar: true,
          manageUsers: false,
          viewAnalytics: true,
          manageProctors: false,
          manageAdmins: false,
          exportReports: false
        };
        break;
    }
  }
  next();
});

// Method to check if user has specific permission
userSchema.methods.hasPermission = function(permission) {
  if (this.role !== 'admin') return false;
  return this.permissions[permission] === true;
};

module.exports = mongoose.model('User', userSchema);