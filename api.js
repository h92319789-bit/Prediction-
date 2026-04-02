const router = require('express').Router();

const sanitize = (str) => String(str).replace(/<[^>]*>/g, '').trim();

// GET /api/predictions - JSON list of active predictions (for search autocomplete)
router.get('/predictions', (req, res) => {
  const db = req.app.locals.db;
  const search = sanitize(req.query.q || '');

  let query = `
    SELECT p.id, p.title, p.category, p.probability, p.stake, p.views, p.created_at,
           u.username as creator_username
    FROM predictions p
    JOIN users u ON p.user_id = u.id
    WHERE p.status = 'active'
  `;
  const params = [];

  if (search) {
    query += ' AND p.title LIKE ?';
    params.push('%' + search + '%');
  }

  // Exclude shadowbanned users' predictions
  query += " AND u.role != 'shadowbanned'";

  query += ' ORDER BY p.created_at DESC LIMIT 50';

  const predictions = db.prepare(query).all(...params);

  res.json({ predictions });
});

// GET /api/notifications/count - unread notification count
router.get('/notifications/count', (req, res) => {
  if (!req.session.user) {
    return res.json({ count: 0 });
  }

  const db = req.app.locals.db;
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
  ).get(req.session.user.id);

  res.json({ count: result.count });
});

// POST /api/notifications/:id/read - mark single notification as read
router.post('/notifications/:id/read', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const db = req.app.locals.db;
  const notificationId = parseInt(req.params.id, 10);

  if (isNaN(notificationId)) {
    return res.status(400).json({ error: 'Invalid notification ID' });
  }

  const result = db.prepare(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
  ).run(notificationId, req.session.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  res.json({ success: true });
});

module.exports = router;
