const pdf = require('pdf-parse');

// ============================================
// PARSE PDF AND EXTRACT GRADES
// ============================================
async function parsePDF(pdfBuffer) {
  try {
    // Extract text from PDF
    const data = await pdf(pdfBuffer);
    const text = data.text;
    
    console.log('📄 PDF Text extracted, length:', text.length);
    
    // Parse grades from text
    const grades = extractGrades(text);
    
    return grades;
  } catch (error) {
    console.error('PDF parse error:', error);
    throw new Error('Failed to parse PDF');
  }
}

// ============================================
// EXTRACT GRADES FROM TEXT
// ============================================
function extractGrades(text) {
  const grades = [];
  
  // Clean text
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Pattern 1: VIT Standard Format (Table-based)
  // Example: "Operating System    CAT1    55    100    55.00"
  const pattern1 = /^(.+?)\s+(CAT\d?|MID\s?TERM|FINAL|QUIZ|ASSIGNMENT)\s+(\d+\.?\d*)\s+(\d+\.?\d*)/i;
  
  // Pattern 2: Detailed Format
  // Example: "Subject: Operating System, Type: CAT1, Marks: 55/100"
  const pattern2 = /Subject:\s*(.+?),\s*Type:\s*(.+?),\s*Marks:\s*(\d+\.?\d*)\/(\d+\.?\d*)/i;
  
  // Pattern 3: Simple Format
  // Example: "OS - 55/100 - CAT1"
  const pattern3 = /^(.+?)\s*-\s*(\d+\.?\d*)\/(\d+\.?\d*)\s*-\s*(.+?)$/i;
  
  for (const line of lines) {
    let match;
    
    // Try Pattern 1
    match = line.match(pattern1);
    if (match) {
      grades.push({
        subject: match[1].trim(),
        examType: normalizeExamType(match[2]),
        marks: parseFloat(match[3]),
        maxMarks: parseFloat(match[4])
      });
      continue;
    }
    
    // Try Pattern 2
    match = line.match(pattern2);
    if (match) {
      grades.push({
        subject: match[1].trim(),
        examType: normalizeExamType(match[2]),
        marks: parseFloat(match[3]),
        maxMarks: parseFloat(match[4])
      });
      continue;
    }
    
    // Try Pattern 3
    match = line.match(pattern3);
    if (match) {
      grades.push({
        subject: match[1].trim(),
        examType: normalizeExamType(match[4]),
        marks: parseFloat(match[2]),
        maxMarks: parseFloat(match[3])
      });
      continue;
    }
  }
  
  // If no grades found with patterns, try simple table parsing
  if (grades.length === 0) {
    console.log('⚠️ No grades found with patterns, trying table parsing...');
    return parseTableFormat(lines);
  }
  
  // Add default date and semester
  const now = new Date();
  return grades.map(grade => ({
    ...grade,
    date: now,
    semester: getCurrentSemester()
  }));
}

// ============================================
// PARSE TABLE FORMAT (FALLBACK)
// ============================================
function parseTableFormat(lines) {
  const grades = [];
  
  // Look for lines with numbers that might be marks
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Split by multiple spaces
    const parts = line.split(/\s{2,}/).map(p => p.trim());
    
    if (parts.length >= 4) {
      // Check if last two parts are numbers
      const lastTwo = parts.slice(-2);
      if (!isNaN(lastTwo[0]) && !isNaN(lastTwo[1])) {
        const marks = parseFloat(lastTwo[0]);
        const maxMarks = parseFloat(lastTwo[1]);
        
        if (marks <= maxMarks && maxMarks > 0) {
          // Try to find subject and exam type
          let subject = parts[0];
          let examType = 'mid-term'; // default
          
          // Check if second part looks like exam type
          if (parts.length >= 3) {
            const possibleType = parts[1];
            if (/CAT|QUIZ|MID|FINAL|ASSIGNMENT/i.test(possibleType)) {
              examType = normalizeExamType(possibleType);
            }
          }
          
          grades.push({
            subject,
            examType,
            marks,
            maxMarks,
            date: new Date(),
            semester: getCurrentSemester()
          });
        }
      }
    }
  }
  
  return grades;
}

// ============================================
// NORMALIZE EXAM TYPE
// ============================================
function normalizeExamType(type) {
  const normalized = type.toLowerCase().replace(/\s+/g, '-');
  
  if (/cat\s*1|cat1/.test(normalized)) return 'cat1';
  if (/cat\s*2|cat2/.test(normalized)) return 'cat2';
  if (/mid|midterm/.test(normalized)) return 'mid-term';
  if (/final/.test(normalized)) return 'final';
  if (/quiz/.test(normalized)) return 'quiz';
  if (/assignment/.test(normalized)) return 'assignment';
  if (/project/.test(normalized)) return 'course-project';
  
  return 'mid-term'; // default
}

// ============================================
// GET CURRENT SEMESTER (ESTIMATE)
// ============================================
function getCurrentSemester() {
  const month = new Date().getMonth() + 1; // 1-12
  
  // Assume:
  // Jan-May = Spring semester (even semester: 2, 4, 6, 8)
  // Aug-Dec = Fall semester (odd semester: 1, 3, 5, 7)
  
  if (month >= 1 && month <= 5) {
    return 6; // Default spring semester
  } else {
    return 5; // Default fall semester
  }
}

module.exports = {
  parsePDF
};