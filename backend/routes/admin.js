const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Task = require('../models/Task');
const Grade = require('../models/Grade');
const Signal = require('../models/Signal');
const CalendarEvent = require('../models/CalendarEvent');
const { authMiddleware } = require('./auth');

// Middleware to check if user is admin
const adminMiddleware = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Middleware to check specific permission
const checkPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.userId);
      if (!user || user.role !== 'admin' || !user.permissions[permission]) {
        return res.status(403).json({ error: `Permission required: ${permission}` });
      }
      next();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
};

// Apply auth and admin middleware to all routes
router.use(authMiddleware);
router.use(adminMiddleware);

// ============ USER MANAGEMENT ============

// Get all users with filters
router.get('/users', async (req, res) => {
  try {
    const { role, department, isActive, search } = req.query;
    
    let query = {};
    
    if (role) query.role = role;
    if (department) query.department = department;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { rollNumber: { $regex: search, $options: 'i' } },
        { proctorId: { $regex: search, $options: 'i' } }
      ];
    }
    
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user
router.put('/users/:id', async (req, res) => {
  try {
    const { password, ...updateData } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ANALYTICS ============

// Get overview stats
router.get('/analytics/overview', async (req, res) => {
  try {
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalProctors = await User.countDocuments({ role: 'proctor' });
    
    const upcomingEvents = await CalendarEvent.countDocuments({
      startDate: { $gte: new Date() }
    });
    
    res.json({
      users: {
        totalStudents,
        totalProctors
      },
      burnoutRisk: {
        high: 0,
        medium: 0,
        low: totalStudents
      },
      upcomingEvents
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get department breakdown
router.get('/analytics/departments', async (req, res) => {
  try {
    const departments = await User.aggregate([
      { $match: { role: 'student' } },
      { 
        $group: { 
          _id: '$department',
          count: { $sum: 1 }
        } 
      },
      { $sort: { count: -1 } }
    ]);
    
    res.json(departments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ CALENDAR MANAGEMENT ============

// Get all institutional events
router.get('/calendar', async (req, res) => {
  try {
    const events = await CalendarEvent.find({ isInstitutional: true })
      .populate('createdBy', 'name email')
      .sort({ startDate: 1 });
    
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create institutional event
router.post('/calendar', checkPermission('manageCalendar'), async (req, res) => {
  try {
    const { title, description, startDate, endDate, type, priority, venue } = req.body;
    
    const event = await CalendarEvent.create({
      title,
      description,
      startDate,
      endDate: endDate || startDate,
      eventType: type || 'event',
      priority: priority || 'medium',
      venue,
      isInstitutional: true,
      createdBy: req.userId
    });
    
    res.status(201).json({ message: 'Event created successfully', event });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete institutional event
router.delete('/calendar/:id', checkPermission('manageCalendar'), async (req, res) => {
  try {
    const event = await CalendarEvent.findOneAndDelete({
      _id: req.params.id,
      isInstitutional: true
    });
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all events
router.delete('/calendar/clear-all', checkPermission('manageCalendar'), async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'DELETE_ALL_EVENTS') {
      return res.status(400).json({ error: 'Confirmation required' });
    }
    
    const result = await CalendarEvent.deleteMany({ isInstitutional: true });
    
    res.json({ 
      message: 'All events deleted',
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk upload
router.post('/calendar/bulk', checkPermission('manageCalendar'), async (req, res) => {
  try {
    const { events } = req.body;
    
    const eventsWithMeta = events.map(e => ({
      ...e,
      eventType: e.type,
      isInstitutional: true,
      createdBy: req.userId
    }));
    
    const saved = await CalendarEvent.insertMany(eventsWithMeta);
    
    res.json({ 
      message: `${saved.length} events uploaded`,
      count: saved.length 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PDF CALENDAR UPLOAD WITH OCR ============

const multer = require('multer');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const fs = require('fs').promises;
const path = require('path');
const { convert } = require('pdf-poppler');

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

function detectEventType(details) {
  const text = details.toLowerCase();
  if (text.includes('holiday') || text.includes('vacation')) return 'holiday';
  if (text.includes('exam') || text.includes('test') || text.includes('fat') || text.includes('assessment')) return 'exam';
  if (text.includes('registration') || text.includes('wish') || text.includes('allocation')) return 'registration';
  if (text.includes('deadline') || text.includes('last')) return 'deadline';
  if (text.includes('instructional') || text.includes('first')) return 'academic';
  return 'event';
}

function detectPriority(details) {
  const text = details.toLowerCase();
  if (text.includes('exam') || text.includes('fat') || text.includes('final')) return 'high';
  if (text.includes('holiday') || text.includes('deadline')) return 'high';
  return 'medium';
}

function parseDate(dateStr) {
  if (dateStr.includes(' to ')) {
    const dates = dateStr.split(' to ');
    return {
      start: parseDate(dates[0].trim()),
      end: parseDate(dates[1].trim())
    };
  }
  
  // Support both . and - separators (e.g., 08.04.2026 or 08-04-2026)
  let parts = dateStr.split('.');
  if (parts.length !== 3) {
    parts = dateStr.split('-');
  }
  
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    return new Date(year, month, day);
  }
  return null;
}

// Helper function to extract text using OCR
async function extractTextWithOCR(buffer) {
  const tempDir = path.join(__dirname, '../temp');
  await fs.mkdir(tempDir, { recursive: true });
  
  const pdfPath = path.join(tempDir, `temp-${Date.now()}.pdf`);
  const outputPath = path.join(tempDir, `output-${Date.now()}`);
  
  try {
    console.log('📄 Saving PDF to:', pdfPath);
    await fs.writeFile(pdfPath, buffer);
    
    // Convert PDF to images
    const opts = {
      format: 'png',
      out_dir: tempDir,
      out_prefix: path.basename(outputPath),
      page: null // all pages
    };
    
    console.log('🖼️  Converting PDF to images...');
    await convert(pdfPath, opts);
    
    // Get all generated images
    const files = await fs.readdir(tempDir);
    const imageFiles = files.filter(f => f.startsWith(path.basename(outputPath)) && f.endsWith('.png'));
    
    console.log(`📸 Found ${imageFiles.length} image(s) to process`);
    
    let allText = '';
    
    // OCR each image
    for (let idx = 0; idx < imageFiles.length; idx++) {
      const imageFile = imageFiles[idx];
      const imagePath = path.join(tempDir, imageFile);
      
      console.log(`🔍 Processing image ${idx + 1}/${imageFiles.length}: ${imageFile}`);
      
      const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
        logger: () => {} // Disable verbose logging
      });
      
      console.log(`   ✓ Extracted ${text.length} characters`);
      allText += text + '\n';
      
      // Clean up image
      await fs.unlink(imagePath);
    }
    
    // Clean up PDF
    await fs.unlink(pdfPath);
    
    console.log(`\n📝 Total text extracted: ${allText.length} characters`);
    console.log(`📝 Total lines: ${allText.split('\n').length}`);
    
    return allText;
    
  } catch (error) {
    console.error('❌ OCR error:', error);
    throw error;
  }
}

// Enhanced parsing for table-structured data
function parseCalendarTable(text) {
  const events = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  console.log('=== PARSING CALENDAR ===');
  console.log('Total lines:', lines.length);
  
  const singleDatePattern = /(\d{2}[-\.]\d{2}[-\.]\d{4})/g;
  const dateInfoMap = new Map();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip headers/footers
    if (line.match(/VIT\/VLR/) || line.match(/CIRCULAR/) || line.match(/Academic Calendar/) || 
        line.match(/^#/) || line.match(/Note:/) || line.match(/Page \d+/) ||
        line.match(/^Date\(s\)/) || line.match(/^Day$/i) || line.match(/^Activity$/i)) {
      continue;
    }
    
    const dateMatches = [...line.matchAll(singleDatePattern)];
    
    if (dateMatches.length > 0) {
      console.log(`Line ${i}: "${line}"`);
      console.log(`  Found ${dateMatches.length} date(s)`);
      
      const dates = dateMatches.map(m => m[1]);
      let dateKey, startDate, endDate;
      
      if (dates.length === 2) {
        dateKey = `${dates[0]} to ${dates[1]}`;
        startDate = dates[0];
        endDate = dates[1];
      } else {
        dateKey = dates[0];
        startDate = dates[0];
        endDate = dates[0];
      }
      
      let description = findActivityDescription(lines, i, line, dates);
      
      if (description) {
        dateInfoMap.set(dateKey, { startDate, endDate, description, line: i });
        console.log(`  ✓ Extracted: ${dateKey} -> ${description}`);
      }
    }
  }
  
  console.log('\n=== CREATING EVENTS ===');
  for (const [dateKey, info] of dateInfoMap.entries()) {
    const start = parseDate(info.startDate);
    const end = parseDate(info.endDate);
    
    if (start && end) {
      events.push({
        title: info.description,
        description: info.description,
        startDate: start,
        endDate: end,
        eventType: detectEventType(info.description),
        priority: detectPriority(info.description)
      });
      console.log(`✓ Event: ${info.description} (${info.startDate} to ${info.endDate})`);
    }
  }
  
  console.log(`\n=== TOTAL: ${events.length} events ===\n`);
  return events;
}

function findActivityDescription(lines, currentIndex, currentLine, dates) {
  let cleaned = currentLine;
  dates.forEach(date => { cleaned = cleaned.replace(date, ''); });
  
  cleaned = cleaned
    .replace(/\d{10}\s*\|/g, '')
    .replace(/^\|+/, '').replace(/\|+$/, '')
    .replace(/\s+to\s*$/i, '')
    .replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*to?/i, '')
    .replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i, '')
    .replace(/[''""]/g, '')
    .trim();
  
  if (cleaned && cleaned.length > 8 && !cleaned.match(/^\d+$/) && !cleaned.match(/^to$/i)) {
    return cleaned;
  }
  
  for (let offset = 1; offset <= 4; offset++) {
    if (currentIndex + offset >= lines.length) break;
    const nextLine = lines[currentIndex + offset].trim();
    
    if (nextLine.match(/\d{2}[-\.]\d{2}[-\.]\d{4}/)) continue;
    if (nextLine.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i)) continue;
    if (nextLine.match(/^(Date|Day|Activity)/i)) continue;
    if (nextLine.match(/^#/)) continue;
    if (nextLine.length < 8) continue;
    if (nextLine.match(/^\d+$/)) continue;
    if (nextLine.match(/Note:/i)) break;
    
    const cleanedNext = nextLine.replace(/^\|+/, '').replace(/\|+$/, '').replace(/[''""]/g, '').trim();
    if (cleanedNext.length > 8) return cleanedNext;
  }
  
  if (currentIndex > 0) {
    const prevLine = lines[currentIndex - 1].trim();
    if (!prevLine.match(/\d{2}[-\.]\d{2}[-\.]\d{4}/) &&
        !prevLine.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i) &&
        prevLine.length > 8) {
      return prevLine.replace(/^\|+/, '').replace(/\|+$/, '').trim();
    }
  }
  
  return '';
}

router.post('/calendar/upload-pdf', checkPermission('manageCalendar'), upload.single('calendar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF uploaded' });
    }

    let extractedText = '';
    
    // First, try standard PDF text extraction
    try {
      const pdfData = await pdfParse(req.file.buffer);
      extractedText = pdfData.text;
      console.log('Text-based PDF extraction:', extractedText.substring(0, 200));
    } catch (error) {
      console.log('Text extraction failed, trying OCR...');
    }
    
    // If no text found, use OCR
    if (!extractedText || extractedText.trim().length < 50) {
      console.log('Using OCR for image-based PDF...');
      extractedText = await extractTextWithOCR(req.file.buffer);
      console.log('OCR extraction:', extractedText.substring(0, 200));
    }
    
    // Parse the calendar table
    const events = parseCalendarTable(extractedText);
    
    console.log('Total events parsed:', events.length);

    if (events.length > 0) {
      const eventsWithMeta = events.map(e => ({
        ...e,
        isInstitutional: true,
        createdBy: req.userId
      }));
      
      await CalendarEvent.insertMany(eventsWithMeta);
    }

    res.json({ 
      success: true,
      message: `${events.length} events uploaded successfully`,
      count: events.length,
      events: events.map(e => ({ 
        title: e.title, 
        date: e.startDate.toISOString().split('T')[0] 
      }))
    });

  } catch (error) {
    console.error('PDF upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/calendar/manual-bulk', checkPermission('manageCalendar'), async (req, res) => {
  try {
    const { events } = req.body;
    
    const processedEvents = [];
    
    for (const event of events) {
      let startDate, endDate;
      
      if (event.dateRange) {
        const [start, end] = event.dateRange.split(' to ').map(d => d.trim());
        startDate = parseDate(start);
        endDate = parseDate(end);
      } else if (event.date) {
        startDate = parseDate(event.date);
        endDate = startDate;
      }
      
      if (startDate && event.activity) {
        processedEvents.push({
          title: event.activity,
          description: event.activity,
          startDate,
          endDate: endDate || startDate,
          eventType: detectEventType(event.activity),
          priority: detectPriority(event.activity),
          isInstitutional: true,
          createdBy: req.userId
        });
      }
    }
    
    if (processedEvents.length > 0) {
      await CalendarEvent.insertMany(processedEvents);
    }
    
    res.json({
      success: true,
      message: `${processedEvents.length} events created`,
      count: processedEvents.length
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});//Manual version of bulk upload for testing without OCR

module.exports = router;