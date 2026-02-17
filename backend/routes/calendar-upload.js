const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const CalendarEvent = require('../models/CalendarEvent');
const { authMiddleware } = require('./auth');

// Configure multer for PDF upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware to check if user is admin
const adminMiddleware = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Helper function to detect event type from details text
function detectEventType(details) {
  const text = details.toLowerCase();
  
  if (text.includes('holiday') || text.includes('vacation')) return 'holiday';
  if (text.includes('exam') || text.includes('test') || text.includes('assessment') || text.includes('fat')) return 'exam';
  if (text.includes('registration') || text.includes('course wish')) return 'registration';
  if (text.includes('last date') || text.includes('deadline') || text.includes('last instructional')) return 'deadline';
  if (text.includes('commencement') || text.includes('semester')) return 'event';
  
  return 'other';
}

// Helper function to detect priority
function detectPriority(details) {
  const text = details.toLowerCase();
  
  if (text.includes('exam') || text.includes('test') || text.includes('fat') || text.includes('final')) return 'high';
  if (text.includes('holiday') || text.includes('last date') || text.includes('deadline')) return 'high';
  if (text.includes('registration') || text.includes('commencement')) return 'medium';
  
  return 'low';
}

// Helper function to parse date from different formats
function parseDate(dateStr, year = new Date().getFullYear()) {
  // Remove extra spaces and clean up
  dateStr = dateStr.trim();
  
  // Handle date ranges like "09.06.2025 to 20.06.2025"
  if (dateStr.includes(' to ')) {
    const dates = dateStr.split(' to ');
    return {
      start: parseDate(dates[0].trim(), year),
      end: parseDate(dates[1].trim(), year)
    };
  }
  
  // Handle DD.MM.YYYY format
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
    const yearPart = parseInt(parts[2]);
    return new Date(yearPart, month, day);
  }
  
  return null;
}

// Parse PDF and extract calendar events
router.post('/parse-pdf', authMiddleware, adminMiddleware, upload.single('calendar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    // Parse PDF
    const pdfData = await pdfParse(req.file.buffer);
    const text = pdfData.text;

    // Split into lines
    const lines = text.split('\n').filter(line => line.trim());

    // Extract events
    const events = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Look for date pattern (DD.MM.YYYY or DD.MM.YYYY to DD.MM.YYYY)
      const datePattern = /(\d{2}\.\d{2}\.\d{4}(\s+to\s+\d{2}\.\d{2}\.\d{4})?)/;
      const match = line.match(datePattern);

      if (match) {
        const dateStr = match[1];
        
        // Find day (next line or same line)
        let day = '';
        let details = '';
        let detailsIndex = i + 1;

        // Check if day is on same line or next line
        const dayPattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/;
        const dayMatch = line.match(dayPattern);
        
        if (dayMatch) {
          day = dayMatch[1];
          // Details are likely after the day on same line or next line
          const afterDay = line.substring(line.indexOf(day) + day.length).trim();
          if (afterDay) {
            details = afterDay;
          } else if (i + 1 < lines.length) {
            details = lines[i + 1].trim();
            detailsIndex = i + 2;
          }
        } else if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const nextDayMatch = nextLine.match(dayPattern);
          
          if (nextDayMatch) {
            day = nextDayMatch[1];
            // Details on line after day
            if (i + 2 < lines.length) {
              details = lines[i + 2].trim();
              detailsIndex = i + 3;
            }
          }
        }

        // Parse dates
        const parsedDate = parseDate(dateStr);
        
        if (parsedDate && details) {
          let startDate, endDate;
          
          if (parsedDate.start && parsedDate.end) {
            // Date range
            startDate = parsedDate.start;
            endDate = parsedDate.end;
          } else {
            // Single date
            startDate = parsedDate;
            endDate = parsedDate;
          }

          // Create event object
          const event = {
            title: details,
            description: `${day} - ${details}`,
            startDate: startDate,
            endDate: endDate,
            eventType: detectEventType(details),
            priority: detectPriority(details),
            isInstitutional: true,
            targetDepartments: [],
            targetSemesters: []
          };

          events.push(event);
        }

        i = detailsIndex;
      } else {
        i++;
      }
    }

    res.json({ 
      success: true, 
      eventsCount: events.length,
      events: events 
    });

  } catch (error) {
    console.error('PDF parsing error:', error);
    res.status(500).json({ error: 'Failed to parse PDF: ' + error.message });
  }
});

// Bulk save parsed events
router.post('/bulk-save-events', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { events } = req.body;

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid events data' });
    }

    // Add createdBy to each event
    const eventsWithCreator = events.map(event => ({
      ...event,
      createdBy: req.userId,
      isInstitutional: true
    }));

    // Bulk insert
    const savedEvents = await CalendarEvent.insertMany(eventsWithCreator);

    res.json({ 
      success: true, 
      message: `${savedEvents.length} events saved successfully`,
      savedCount: savedEvents.length 
    });

  } catch (error) {
    console.error('Bulk save error:', error);
    res.status(500).json({ error: 'Failed to save events: ' + error.message });
  }
});

module.exports = router;