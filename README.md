# Academic Burnout Prediction System - Complete Project Analysis

## 📋 Table of Contents
1. [Project Structure](#project-structure)
2. [How Your System Works](#how-your-system-works)
3. [Data Flow Analysis](#data-flow-analysis)
4. [The Problem Identified](#the-problem-identified)
5. [Why Calendar Events Are Missing](#why-calendar-events-are-missing)
6. [Solution Architecture](#solution-architecture)

---

## 📁 Project Structure

```
burnout-system/
├── backend/
│   ├── config/
│   │   └── constants.js           # System constants (weights, thresholds)
│   ├── models/
│   │   ├── CalendarEvent.js       # Calendar event schema
│   │   ├── Grade.js               # Student grades schema
│   │   ├── Intervention.js        # Proctor interventions schema
│   │   ├── Signal.js              # Burnout signals schema
│   │   ├── Task.js                # Student tasks schema
│   │   ├── User.js                # User (student/proctor/admin) schema
│   │   └── WorkloadScore.js       # Daily/weekly workload scores
│   ├── routes/
│   │   ├── admin.js               # Admin routes (manage users, calendar, analytics)
│   │   ├── auth.js                # Authentication routes
│   │   ├── burnout.js             # Burnout analysis routes
│   │   ├── calendar.js            # ⚠️ Calendar routes (personal + institutional)
│   │   ├── calendar-upload.js     # Admin calendar upload
│   │   ├── grades.js              # Grade management routes
│   │   ├── proctor.js             # Proctor routes
│   │   ├── tasks.js               # Task management routes
│   │   ├── workload.js            # ⚠️ Workload data routes
│   │   └── routes.js              # Main route aggregator
│   ├── services/
│   │   ├── burnout.js             # ⚠️ Main burnout prediction logic
│   │   ├── collision.js           # Deadline collision detection
│   │   ├── drift.js               # Performance drift detection
│   │   ├── recovery.js            # Recovery gap detection
│   │   ├── volatility.js          # Workload spike detection
│   │   └── workload.js            # ⚠️ Workload calculation service
│   ├── jobs.js                    # Scheduled jobs (daily analysis)
│   └── server.js                  # Express server entry point
├── frontend/
│   ├── css/
│   │   └── main.css               # Styles
│   ├── js/
│   │   └── api.js                 # ⚠️ API wrapper functions
│   ├── pages/
│   │   ├── student.html           # ⚠️ Student dashboard (NEEDS FIX)
│   │   ├── tasks.html             # Task management page
│   │   ├── calendar.html          # ✅ Calendar page (WORKING)
│   │   ├── grades.html            # Grade management page
│   │   ├── login.html             # Login/register page
│   │   ├── proctor.html           # Proctor dashboard
│   │   └── admin.html             # Admin dashboard
│   └── index.html                 # Landing page
```

⚠️ = Files involved in the issue
✅ = Files working correctly

---

## 🔄 How Your System Works

### **1. Data Collection**

#### **Tasks** (from `/routes/tasks.js`)
- Students create tasks with:
  - Title, type (exam/project/assignment/quiz)
  - Deadline, estimated effort (hours)
  - Completion status

#### **Grades** (from `/routes/grades.js`)
- Students add grades with:
  - Subject, exam type
  - Marks, max marks, percentage
  - Date, semester

#### **Calendar Events** (from `/routes/calendar.js`)
- **Institutional Events** (created by Admin):
  - Student Tour, Welfare Visit, Course Wish List, etc.
  - Visible to ALL students
  - Have: title, eventType, startDate, endDate, priority, venue
  
- **Personal Events** (created by Students):
  - Private to each student
  - Same structure as institutional

### **2. Workload Calculation** (from `/services/workload.js`)

**Current Implementation:**
```javascript
calculateWorkloadScores(studentId, startDate, endDate) {
  // 1. Fetch tasks in date range
  const tasks = await Task.find({ studentId, deadline: {...} });
  
  // 2. Group by day
  tasks.forEach(task => {
    const weight = WEIGHTS[task.type];  // exam=3, project=2.5, etc.
    const weightedEffort = task.estimatedEffort * weight;
    dailyScores[date] += weightedEffort;
  });
  
  // 3. Save to WorkloadScore collection
  // 4. Calculate weekly aggregates
}
```

**📊 Weights:**
- Exam: 3x
- Project: 2.5x
- Assignment: 1.5x
- Quiz: 1x

### **3. Burnout Prediction** (from `/services/burnout.js`)

**Current Implementation:**
```javascript
predictBurnout(studentId) {
  // Run 4 detectors in parallel
  [collision, volatility, recovery, drift] = await Promise.all([
    detectCollisions(studentId),      // Check upcoming deadline overload
    detectVolatility(studentId),       // Check workload spikes
    analyzeRecoveryGap(studentId),     // Check continuous work without rest
    analyzePerformanceDrift(studentId) // Check grades vs effort trend
  ]);
  
  // Calculate score (0-100)
  score = 0;
  if (collision.hasCollision) score += 30;
  if (volatility.hasVolatility) score += 15-25;
  if (recovery.hasRecoveryDeficit) score += 25;
  if (drift.hasDrift) score += 10-20;
  
  // Determine risk level
  if (score >= 60) risk = 'high';
  else if (score >= 30) risk = 'medium';
  else risk = 'low';
  
  // Save to Signal collection
}
```

### **4. Signal Detectors**

#### **Collision Detector** (`/services/collision.js`)
- Gets tasks from next 14 days
- Groups by week
- Checks if:
  - ≥3 major tasks (exam/project) in one week, OR
  - Total hours >50 in one week
- **🚨 PROBLEM:** Only checks TASKS, not EVENTS

#### **Volatility Detector** (`/services/volatility.js`)
- Gets last 4 weeks workload
- Compares current week vs previous week
- Flags if increase ≥50%
- **🚨 PROBLEM:** Workload only from TASKS

#### **Recovery Detector** (`/services/recovery.js`)
- Gets last 30 days workload
- Finds continuous high-load days (score >10)
- Flags if ≥7 days without rest
- **🚨 PROBLEM:** Workload only from TASKS

#### **Drift Detector** (`/services/drift.js`)
- Gets 6 months of grades and workload
- Checks if effort increasing but grades declining
- Flags sustained drift (≥3 months)
- **🚨 PROBLEM:** Workload only from TASKS

---

## 📊 Data Flow Analysis

### **Current Flow (INCOMPLETE)**

```
Student adds Task
    ↓
Task saved to MongoDB
    ↓
calculateWorkloadScores() reads ONLY tasks
    ↓
WorkloadScore collection updated
    ↓
predictBurnout() runs detectors
    ↓
Detectors read WorkloadScore (incomplete data)
    ↓
Signal saved with INACCURATE burnout score
    ↓
Student dashboard shows WRONG risk level
```

### **What Happens to Calendar Events?**

```
Admin uploads institutional events
    ↓
CalendarEvent.create({ isInstitutional: true })
    ↓
Saved to MongoDB
    ↓
/calendar/all route returns events
    ↓
calendar.html displays them ✅
    ↓
BUT... they are NEVER read by workload calculation ❌
    ↓
burnout prediction ignores them ❌
    ↓
student.html doesn't show them ❌
```

---

## 🚨 The Problem Identified

### **Issue #1: Calendar Events NOT in Workload Calculation**

**File:** `/services/workload.js`
**Function:** `calculateWorkloadScores()`

**Current Code:**
```javascript
const tasks = await Task.find({
  studentId,
  deadline: { $gte: startDate, $lte: endDate }
});
// ❌ Calendar events are NEVER fetched
```

**Impact:**
- Student has 5 upcoming events → Workload shows 0
- Burnout score = LOW (incorrect)
- Charts are empty or misleading

### **Issue #2: Collision Detector Ignores Events**

**File:** `/services/collision.js`
**Function:** `detectCollisions()`

**Current Code:**
```javascript
const tasks = await Task.find({
  studentId,
  deadline: { $gte: today, $lte: twoWeeksLater }
});
// ❌ Doesn't count Student Tour, Welfare Visit, etc.
```

**Impact:**
- Student has 3 exams + 2 events in one week
- System sees only 3 items → No collision warning
- Should trigger collision (≥3 major items)

### **Issue #3: Student Dashboard Missing Events**

**File:** `/frontend/pages/student.html`
**Current Code:**
```javascript
// Only loads:
await loadBurnoutAnalysis();
await loadWorkloadChart();
await loadUpcomingTasks();
await loadRecentGrades();

// ❌ No function to load calendar events
```

**Impact:**
- Events exist in database
- calendar.html shows them
- student.html doesn't display them

---

## 💡 Solution Architecture

### **Phase 1: Backend Fixes**

#### **1.1 Update Workload Service**
**File:** `/services/workload.js`

**Changes:**
- Fetch both tasks AND calendar events
- Calculate event workload with proper weights
- Combine task + event scores

**Event Weights:**
```javascript
exam: 8       // High stress (equivalent to 2 exam tasks)
registration: 4  // Moderate effort
event: 3      // General attendance
holiday: 0    // Rest day
```

#### **1.2 Update Collision Detector**
**File:** `/services/collision.js`

**Changes:**
- Fetch calendar events alongside tasks
- Count institutional events as major items
- Include in collision check

#### **1.3 Update Burnout Service**
**File:** `/services/burnout.js`

**Changes:**
- Pass event data to all detectors
- Include events in reasons array
- Update signal schema if needed

### **Phase 2: Frontend Fixes**

#### **2.1 Update API Client**
**File:** `/frontend/js/api.js`

**Status:** ✅ Already correct
```javascript
calendarAPI.get(startDate, endDate) {
  return apiCall(`/calendar/all?startDate=${...}&endDate=${...}`);
}
```

#### **2.2 Update Student Dashboard**
**File:** `/frontend/pages/student.html`

**Changes:**
- Add `loadUpcomingEvents()` function
- Display events with proper styling
- Auto-refresh when returning to page

### **Phase 3: Data Model Updates**

#### **3.1 CalendarEvent Model**
**File:** `/models/CalendarEvent.js`

**Verify fields:**
- `eventType`: exam | registration | event | holiday
- `isInstitutional`: boolean
- `startDate`, `endDate`: Date
- `duration`: number (hours) - ADD if missing

#### **3.2 WorkloadScore Model**
**File:** `/models/WorkloadScore.js`

**Add fields:**
```javascript
{
  taskScore: Number,    // Workload from tasks only
  eventScore: Number,   // Workload from events only
  dailyScore: Number,   // Total (task + event)
  // ... existing fields
}
```

---

## 🎯 Implementation Priority

### **HIGH PRIORITY (Fix Now)**
1. ✅ Update `/services/workload.js` - Include events in calculation
2. ✅ Update `/services/collision.js` - Count events in collision
3. ✅ Update `/frontend/pages/student.html` - Display events

### **MEDIUM PRIORITY (Fix Soon)**
4. Update `/services/volatility.js` - Include event spikes
5. Update `/services/recovery.js` - Events can be rest days
6. Add event duration field to CalendarEvent model

### **LOW PRIORITY (Enhancement)**
7. Update Signal model to track event-based signals
8. Add event vs task breakdown in analytics
9. Add "event-heavy week" warnings

---

## 📝 Current vs Desired Behavior

### **Scenario: Student with Events**

**Input Data:**
- 2 Exam tasks (deadline: Feb 10)
- 1 Project task (deadline: Feb 12)
- Student Tour event (Feb 8)
- Welfare Visit event (Feb 10)
- Course Registration event (Feb 9)

#### **CURRENT BEHAVIOR ❌**

**Workload Calculation:**
```
Only counts 3 tasks:
- Daily score = Exam(3x5h) + Exam(3x4h) + Project(2.5x8h) = 47h
- Events = 0 (ignored)
- Total = 47h
```

**Collision Detection:**
```
Week of Feb 8-14:
- Major tasks: 2 (exams)
- Total hours: 47h
- Collision? NO (needs ≥3 major OR ≥50h)
```

**Burnout Score:**
```
- Collision: 0 (no collision)
- Volatility: 15 (maybe spike from last week)
- Recovery: 0 (not enough data)
- Drift: 0 (grades OK)
- TOTAL: 15 → LOW RISK ❌
```

**Student Dashboard:**
```
- Burnout Risk: LOW ✓
- Workload Chart: Shows 47h ✓
- Upcoming Tasks: Shows 3 tasks ✓
- Upcoming Events: MISSING ❌
```

#### **DESIRED BEHAVIOR ✅**

**Workload Calculation:**
```
Tasks: 47h
Events:
- Student Tour: 8 (exam-type) × 3h = 24
- Welfare Visit: 8 × 3h = 24
- Registration: 4 × 3h = 12
- Total event score = 60

Combined daily score = 107h for the week
```

**Collision Detection:**
```
Week of Feb 8-14:
- Major items: 2 exams + 2 major events = 4
- Total hours: 107h
- Collision? YES (≥3 major AND ≥50h) ✅
```

**Burnout Score:**
```
- Collision: 30 (overload detected) ✅
- Volatility: 20 (spike from 47h to 107h)
- Recovery: 0
- Drift: 0
- TOTAL: 50 → MEDIUM RISK ✅
```

**Student Dashboard:**
```
- Burnout Risk: MEDIUM ✓
- Workload Chart: Shows 107h ✓
- Upcoming Tasks: Shows 3 tasks ✓
- Upcoming Events: Shows 3 events ✅
- Alerts: "Deadline Overload Alert!" ✅
```

---

## 🔍 How to Verify the Fix

### **Step 1: Check Database**
```javascript
// In MongoDB or via API
CalendarEvent.find({ isInstitutional: true })
// Should return events like Student Tour, Welfare Visit
```

### **Step 2: Check Workload API**
```bash
GET /api/workload?days=30
Authorization: Bearer {token}

# BEFORE FIX:
{
  "date": "2026-02-10",
  "dailyScore": 47,
  "taskCount": 3,
  "eventCount": 0  ❌
}

# AFTER FIX:
{
  "date": "2026-02-10",
  "dailyScore": 107,
  "taskScore": 47,
  "eventScore": 60,
  "taskCount": 3,
  "eventCount": 3  ✅
}
```

### **Step 3: Check Burnout API**
```bash
GET /api/burnout/analysis
Authorization: Bearer {token}

# BEFORE FIX:
{
  "score": 15,
  "risk": "low",
  "reasons": []
}

# AFTER FIX:
{
  "score": 50,
  "risk": "medium",
  "reasons": [
    "4 major deadlines/events in next 7 days",
    "Workload increased by 127%"
  ],
  "signals": {
    "collision": {
      "hasCollision": true,
      "count": 4,
      "tasks": 2,
      "events": 2  ✅
    }
  }
}
```

### **Step 4: Check Student Dashboard**
- Refresh page
- Should see "Upcoming Events" section
- Should see higher burnout score
- Workload chart should show spikes on event days

---

## 📚 Key Takeaways

### **What Was Wrong:**
1. ❌ Workload calculation only counted tasks
2. ❌ Calendar events were isolated in their own feature
3. ❌ No integration between calendar and burnout system
4. ❌ Student dashboard didn't display events

### **What Needs to Happen:**
1. ✅ Fetch events alongside tasks in workload calculation
2. ✅ Assign appropriate weights to event types
3. ✅ Include events in all 4 burnout detectors
4. ✅ Display events on student dashboard
5. ✅ Combine task + event data in all analyses

### **Why This Matters:**
- **Accuracy**: Burnout prediction is only as good as the data
- **Completeness**: Missing 50% of workload = Wrong predictions
- **User Trust**: Students won't trust "LOW RISK" when they're overwhelmed
- **Proctor Effectiveness**: Can't intervene if system doesn't detect issues

---

## 🚀 Next Steps

1. Read this document thoroughly
2. Review the provided fix files
3. Implement backend changes first
4. Test each change individually
5. Update frontend last
6. Verify with test data

Ready for the detailed fix implementation! 💪