const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const Grade = require('../models/Grade');
const { authMiddleware } = require('./auth');

// Setup multer for file upload
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// ============================================
// EXCEL/CSV UPLOAD ENDPOINT
// ============================================
// CSV/EXCEL UPLOAD ENDPOINT
router.post('/upload-excel', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const XLSX = require('xlsx');
    const workbook = XLSX.read(req.file.buffer);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    const grades = [];
    
    data.forEach(row => {
      // Try multiple column name variations
      const subject = row['Course Title'] || row.CourseTitle || row.Subject || row.subject || 'Unknown';
      const examType = row['Course Type'] || row.CourseType || row.ExamType || row.examType || row['Exam Type'] || 'assignment';
      const grade = row.Grade || row.grade;
      
      // If marks are provided directly
      let marks = parseFloat(row.Marks || row.marks || 0);
      let maxMarks = parseFloat(row.MaxMarks || row.maxMarks || row['Max Marks'] || 100);
      
      // If grade letter is provided (S, A, B, etc.), convert to marks
      if (grade && !marks) {
        const gradeMap = {
          'S': 95, 'A': 85, 'B': 75, 'C': 65, 
          'D': 55, 'E': 50, 'P': 50, 'F': 40, 'U': 0
        };
        marks = gradeMap[grade.toUpperCase()] || 0;
        maxMarks = 100;
      }

      // Normalize exam type
      const normalizedExamType = normalizeExamType(examType);

      if (subject && marks >= 0) {
        grades.push({
          subject: subject.trim(),
          examType: normalizedExamType,
          marks: marks,
          maxMarks: maxMarks,
          date: new Date(),
          semester: getCurrentSemester()
        });
      }
    });

    if (grades.length === 0) {
      return res.status(400).json({ error: 'No valid grades found in file' });
    }

    res.json({ success: true, grades });
  } catch (error) {
    console.error('Excel upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Normalize exam type
function normalizeExamType(type) {
  if (!type) return 'assignment';
  
  const typeStr = type.toString().toUpperCase();
  
  const typeMap = {
    'ETL': 'assignment',
    'TH': 'mid-term',
    'LO': 'assignment',
    'PJT': 'course-project',
    'SS': 'assignment',
    'OC': 'assignment',
    'CAT1': 'cat1',
    'CAT2': 'cat2',
    'MIDTERM': 'mid-term',
    'FINAL': 'final',
    'QUIZ': 'quiz',
    'ASSIGNMENT': 'assignment'
  };

  return typeMap[typeStr] || typeMap[type] || 'assignment';
}

function getCurrentSemester() {
  const month = new Date().getMonth() + 1;
  return month >= 1 && month <= 5 ? 6 : 5;
}

// ============================================
// BULK SAVE GRADES
// ============================================
router.post('/bulk', authMiddleware, async (req, res) => {
  try {
    const { grades } = req.body;
    
    const gradesWithUser = grades.map(g => ({
      studentId: req.userId,
      subject: g.subject,
      examType: g.examType,
      marks: g.marks,
      maxMarks: g.maxMarks,
      percentage: (g.marks / g.maxMarks) * 100,
      date: g.date || new Date(),
      semester: g.semester
    }));

    const result = await Grade.insertMany(gradesWithUser);
    res.json({ success: true, count: result.length });
  } catch (error) {
    console.error('Bulk save error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET ALL GRADES FOR STUDENT
// ============================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const grades = await Grade.find({ studentId: req.userId }).sort({ date: -1 });
    
    const formattedGrades = grades.map(grade => ({
      _id: grade._id,
      subject: grade.subject || 'Unknown',
      examType: grade.examType || 'Assignment',
      marks: grade.marks || 0,
      maxMarks: grade.maxMarks || 100,
      percentage: grade.percentage || 0,
      date: grade.date,
      semester: grade.semester
    }));
    
    res.json(formattedGrades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADD SINGLE GRADE
// ============================================
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { subject, examType, marks, maxMarks, date, semester } = req.body;
    const percentage = (marks / maxMarks) * 100;

    const grade = await Grade.create({
      studentId: req.userId,
      subject,
      examType,
      marks,
      maxMarks,
      percentage,
      date: new Date(date),
      semester
    });

    res.status(201).json({
      _id: grade._id,
      subject: grade.subject,
      examType: grade.examType,
      marks: grade.marks,
      maxMarks: grade.maxMarks,
      percentage: grade.percentage,
      date: grade.date,
      semester: grade.semester
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET GRADES FOR SPECIFIC STUDENT (PROCTOR)
// ============================================
router.get('/student/:studentId', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'proctor') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const grades = await Grade.find({ studentId: req.params.studentId }).sort({ date: -1 });
    
    const formattedGrades = grades.map(grade => ({
      _id: grade._id,
      subject: grade.subject || 'Unknown',
      examType: grade.examType || 'Assignment',
      marks: grade.marks || 0,
      maxMarks: grade.maxMarks || 100,
      percentage: grade.percentage || 0,
      date: grade.date,
      semester: grade.semester
    }));
    
    res.json(formattedGrades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// HELPER FUNCTION
// ============================================
function getCurrentSemester() {
  const month = new Date().getMonth() + 1;
  return month >= 1 && month <= 5 ? 6 : 5;
}

module.exports = router;