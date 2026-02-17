const express = require('express');
const router = express.Router();
const CalendarEvent = require('../models/CalendarEvent');
const { authMiddleware } = require('./auth');

// Apply auth middleware (but NOT admin middleware)
router.use(authMiddleware);

// Get institutional events (accessible to ALL authenticated users)
router.get('/institutional', async (req, res) => {
  try {
    const events = await CalendarEvent.find({ 
      isInstitutional: true 
    })
    .select('title description startDate endDate eventType priority venue')
    .sort({ startDate: 1 });
    
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's personal events + institutional events
router.get('/all', async (req, res) => {
  try {
    const events = await CalendarEvent.find({
      $or: [
        { isInstitutional: true },
        { createdBy: req.userId }
      ]
    })
    .select('title description startDate endDate eventType priority venue isInstitutional')
    .sort({ startDate: 1 });
    
    // Format events for frontend (map eventType to type)
    const formattedEvents = events.map(event => ({
      _id: event._id,
      title: event.title,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      type: event.eventType || 'event',  // ← Frontend expects "type" not "eventType"
      priority: event.priority || 'medium',
      venue: event.venue,
      isPersonal: !event.isInstitutional
    }));
    
    res.json(formattedEvents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get only user's personal events
// Get only user's personal events
router.get('/personal', async (req, res) => {
  try {
    const events = await CalendarEvent.find({ 
      createdBy: req.userId,
      isInstitutional: false 
    })
    .sort({ startDate: 1 });
    
    // Format events for frontend
    const formattedEvents = events.map(event => ({
      _id: event._id,
      title: event.title,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      type: event.eventType || 'event',
      priority: event.priority || 'medium',
      venue: event.venue,
      isPersonal: true
    }));
    
    res.json(formattedEvents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create personal event
router.post('/personal', async (req, res) => {
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
      isInstitutional: false,
      createdBy: req.userId
    });
    
    // Return formatted response
    res.status(201).json({ 
      message: 'Event created successfully', 
      event: {
        _id: event._id,
        title: event.title,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        type: event.eventType,
        priority: event.priority,
        venue: event.venue,
        isPersonal: true
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update personal event
router.put('/personal/:id', async (req, res) => {
  try {
    const event = await CalendarEvent.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.userId },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found or unauthorized' });
    }
    
    res.json({ message: 'Event updated successfully', event });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete personal event
router.delete('/personal/:id', async (req, res) => {
  try {
    const event = await CalendarEvent.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.userId
    });
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found or unauthorized' });
    }
    
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;