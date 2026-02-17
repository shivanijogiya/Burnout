const API_URL = 'http://localhost:5000/api';

// Get auth token
function getToken() {
  return localStorage.getItem('token');
}

// Get user info
function getUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

// Set auth data
function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

// Clear auth data
function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// Check if logged in
function isLoggedIn() {
  return !!getToken();
}

// Check if user has permission
function hasPermission(permission) {
  const user = getUser();
  if (!user || user.role !== 'admin') return false;
  return user.permissions && user.permissions[permission] === true;
}

// API call helper
async function apiCall(endpoint, options = {}) {
  const token = getToken();

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    ...options
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Auth APIs
const authAPI = {
  login: (email, password) =>
    apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),

  register: (userData) =>
    apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    })
};

// Task APIs
const taskAPI = {
  getAll: () => apiCall('/tasks'),

  create: (task) =>
    apiCall('/tasks', {
      method: 'POST',
      body: JSON.stringify(task)
    }),

  update: (id, task) =>
    apiCall(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(task)
    }),

  delete: (id) =>
    apiCall(`/tasks/${id}`, {
      method: 'DELETE'
    })
};

// Workload APIs
const workloadAPI = {
  get: (days = 30) => apiCall(`/workload?days=${days}`),

  getForStudent: (studentId, days = 30) =>
    apiCall(`/workload/student/${studentId}?days=${days}`)
};

// Grade APIs - UPDATED WITH EXCEL UPLOAD
const gradeAPI = {
  getAll: () => apiCall('/grades'),

  create: (grade) =>
    apiCall('/grades', {
      method: 'POST',
      body: JSON.stringify(grade)
    }),

  bulkCreate: (grades) =>
    apiCall('/grades/bulk', {
      method: 'POST',
      body: JSON.stringify({ grades })
    }),

  // Upload Excel/CSV
  uploadExcel: async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();
    const response = await fetch(`${API_URL}/grades/upload-excel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Excel upload failed');
    }

    return response.json();
  },

  getForStudent: (studentId) =>
    apiCall(`/grades/student/${studentId}`)
};

// Calendar APIs
const calendarAPI = {
  get: (startDate, endDate) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiCall(`/calendar/all?${params}`);
  },

  create: (event) =>
    apiCall('/calendar', {
      method: 'POST',
      body: JSON.stringify(event)
    }),

  createInstitutional: (event) =>
    apiCall('/calendar/institutional', {
      method: 'POST',
      body: JSON.stringify(event)
    }),

  delete: (id) =>
    apiCall(`/calendar/${id}`, {
      method: 'DELETE'
    })
};

// Burnout APIs
const burnoutAPI = {
  getAnalysis: () => apiCall('/burnout/analysis'),

  getHistory: (days = 30) => apiCall(`/burnout/history?days=${days}`),

  getAnalysisForStudent: (studentId) =>
    apiCall(`/burnout/analysis/${studentId}`),

  getRecommendations: () => apiCall('/burnout/recommendations')
};

// Proctor APIs
const proctorAPI = {
  getStudents: () => apiCall('/proctor/students'),

  getStudent: (studentId) => apiCall(`/proctor/student/${studentId}`),

  addIntervention: (intervention) =>
    apiCall('/proctor/intervention', {
      method: 'POST',
      body: JSON.stringify(intervention)
    }),

  getInterventions: (studentId) =>
    apiCall(`/proctor/interventions/${studentId}`),

  updateIntervention: (id, status) =>
    apiCall(`/proctor/intervention/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    })
};

// Admin APIs
const adminAPI = {
  getUsers: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return apiCall(`/admin/users?${params}`);
  },

  getUserById: (id) => apiCall(`/admin/users/${id}`),

  createUser: (userData) =>
    apiCall('/admin/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    }),

  updateUser: (id, userData) =>
    apiCall(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    }),

  toggleUserStatus: (id) =>
    apiCall(`/admin/users/${id}/toggle-status`, {
      method: 'PATCH'
    }),

  deleteUser: (id) =>
    apiCall(`/admin/users/${id}`, {
      method: 'DELETE'
    }),

  getProctors: () => apiCall('/admin/proctors'),

  assignStudents: (proctorId, studentIds) =>
    apiCall(`/admin/proctors/${proctorId}/assign-students`, {
      method: 'POST',
      body: JSON.stringify({ studentIds })
    }),

  removeStudents: (proctorId, studentIds) =>
    apiCall(`/admin/proctors/${proctorId}/remove-students`, {
      method: 'POST',
      body: JSON.stringify({ studentIds })
    }),

  getStats: () => apiCall('/admin/analytics/stats'),

  getDepartments: () => apiCall('/admin/analytics/departments'),

  getBurnoutTrends: (days = 30) =>
    apiCall(`/admin/analytics/burnout-trends?days=${days}`),

  getHighRiskStudents: () => apiCall('/admin/analytics/high-risk-students'),

  getInstitutionalEvents: () => apiCall('/admin/calendar/institutional'),

  createInstitutionalEvent: (event) =>
    apiCall('/admin/calendar/institutional', {
      method: 'POST',
      body: JSON.stringify(event)
    }),

  updateInstitutionalEvent: (id, event) =>
    apiCall(`/admin/calendar/institutional/${id}`, {
      method: 'PUT',
      body: JSON.stringify(event)
    }),

  deleteInstitutionalEvent: (id) =>
    apiCall(`/admin/calendar/institutional/${id}`, {
      method: 'DELETE'
    }),

  exportData: (type, format = 'json') =>
    apiCall(`/admin/export/${type}?format=${format}`)
};