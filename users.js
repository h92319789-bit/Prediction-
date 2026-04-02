const router = require('express').Router();
const { requireLogin } = require('../middleware/auth');

const sanitize = (str) => String(str).replace(/<[^>]*>/g, '').trim();

// GET /profile/:username
router.get('/profile/:username', (req, res) => {
  const db = req.app.locals.db;
  const username = sanitize(req.params.username);

  const user = db.prepare(
    'SELECT id, username, bio, avatar_url, created_at, credits, role, ip_address, country, user_agent FROM users WHERE username = ?'
  ).get(username);

  if (!user) {
    return res.status(404).render('error', { title: 'Not Found', message: 'User not found.' });
  }

  // Get user's public predictions
  const predictions = db.prepare(
    `SELECT * FROM predictions WHERE user_id = ? ORDER BY created_at DESC`
  ).all(user.id);

  // Prediction stats
  const stats = db.prepare(
    `SELECT
       COUNT(*) as total_predictions,
       COALESCE(SUM(CASE WHEN status IN ('resolved_yes', 'resolved_no') THEN 1 ELSE 0 END), 0) as resolved_count,
       COALESCE(SUM(CASE WHEN
         (status = 'resolved_yes' AND probability > 50) OR
         (status = 'resolved_no' AND probability < 50)
       THEN 1 ELSE 0 END), 0) as correct_count
     FROM predictions WHERE user_id = ?`
  ).get(user.id);

  const totalBets = db.prepare(
    'SELECT COUNT(*) as count FROM bets WHERE user_id = ?'
  ).get(user.id);

  const accuracy = stats.resolved_count > 0
    ? Math.round((stats.correct_count / stats.resolved_count) * 100)
    : 0;

  const isOwnProfile = req.session.user && req.session.user.id === user.id;
  const isAdmin = req.session.user && req.session.user.role === 'admin';

  // Fetch user's bets
  const userBets = db.prepare(
    `SELECT b.*, p.title as prediction_title, p.status as prediction_status
     FROM bets b
     JOIN predictions p ON b.prediction_id = p.id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC
     LIMIT 50`
  ).all(user.id);

  res.render('profile', {
    profile: user,
    predictions,
    bets: userBets,
    stats: {
      total_predictions: stats.total_predictions,
      accuracy,
      total_bets: totalBets.count
    },
    isOwner: isOwnProfile,
    isAdmin,
    showSensitive: isAdmin
  });
});

// GET /profile/:username/edit
router.get('/profile/:username/edit', requireLogin, (req, res) => {
  const db = req.app.locals.db;
  const username = sanitize(req.params.username);

  if (req.session.user.username !== username) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'You can only edit your own profile.' });
  }

  const user = db.prepare('SELECT id, username, bio, avatar_url FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(404).render('error', { title: 'Not Found', message: 'User not found.' });
  }

  res.render('edit-profile', { profile: user, error: null });
});

// POST /profile/:username/edit
router.post('/profile/:username/edit', requireLogin, (req, res) => {
  const db = req.app.locals.db;
  const username = sanitize(req.params.username);

  if (req.session.user.username !== username) {
    return res.status(403).render('error', { title: 'Forbidden', message: 'You can only edit your own profile.' });
  }

  const user = db.prepare('SELECT id, username, bio, avatar_url FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(404).render('error', { title: 'Not Found', message: 'User not found.' });
  }

  let bio = sanitize(req.body.bio || '');
  if (bio.length > 500) {
    bio = bio.substring(0, 500);
  }

  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, user.id);

  res.redirect('/profile/' + username);
});

// GET /leaderboard
router.get('/leaderboard', (req, res) => {
  const db = req.app.locals.db;

  // Top users by credits (excluding admins)
  const topByCredits = db.prepare(
    `SELECT username, credits, role
     FROM users
     WHERE role != 'admin' AND role != 'banned'
     ORDER BY credits DESC
     LIMIT 50`
  ).all();

  // Top users by prediction accuracy (min 5 resolved predictions)
  const topByAccuracy = db.prepare(
    `SELECT
       u.username,
       u.credits,
       COUNT(*) as resolved_count,
       SUM(CASE WHEN
         (p.status = 'resolved_yes' AND p.probability > 50) OR
         (p.status = 'resolved_no' AND p.probability < 50)
       THEN 1 ELSE 0 END) as correct_count,
       ROUND(
         CAST(SUM(CASE WHEN
           (p.status = 'resolved_yes' AND p.probability > 50) OR
           (p.status = 'resolved_no' AND p.probability < 50)
         THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 1
       ) as accuracy
     FROM predictions p
     JOIN users u ON p.user_id = u.id
     WHERE p.status IN ('resolved_yes', 'resolved_no')
       AND u.role != 'admin'
     GROUP BY p.user_id
     HAVING COUNT(*) >= 5
     ORDER BY accuracy DESC
     LIMIT 50`
  ).all();

  res.render('leaderboard', { byCredits: topByCredits, byAccuracy: topByAccuracy });
});

// GET /notifications
router.get('/notifications', requireLogin, (req, res) => {
  const db = req.app.locals.db;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const total = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ?'
  ).get(req.session.user.id);

  const notifications = db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(req.session.user.id, limit, offset);

  const totalPages = Math.ceil(total.count / limit);

  res.render('notifications', {
    notifications,
    page,
    totalPages,
    total: total.count
  });
});

// POST /notifications/read
router.post('/notifications/read', requireLogin, (req, res) => {
  const db = req.app.locals.db;

  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
    .run(req.session.user.id);

  res.redirect('/notifications');
});

module.exports = router;
