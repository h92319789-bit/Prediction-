const router = require('express').Router();
const { requireLogin } = require('../middleware/auth');
const { createLimiter } = require('../middleware/rateLimit');

const sanitize = (str) => String(str).replace(/<[^>]*>/g, '').trim();

const CATEGORIES = ['Politics', 'Technology', 'Science', 'Sports', 'Entertainment', 'Economics', 'World Events', 'Health', 'Environment', 'Other'];

// GET /predictions/create
router.get('/predictions/create', requireLogin, (req, res) => {
  res.render('create', { error: null, categories: CATEGORIES });
});

// POST /predictions/create
router.post('/predictions/create', requireLogin, createLimiter, (req, res) => {
  const db = req.app.locals.db;
  const { title, description, category, probability, stake } = req.body;

  const cleanTitle = sanitize(title || '');
  const cleanDescription = sanitize(description || '');
  const cleanCategory = sanitize(category || '');
  const prob = parseInt(probability, 10);
  const stakeAmount = parseInt(stake, 10);

  // Validate title
  if (cleanTitle.length < 5 || cleanTitle.length > 200) {
    return res.render('create', { error: 'Title must be between 5 and 200 characters.', categories: CATEGORIES });
  }

  // Validate description
  if (cleanDescription.length < 10 || cleanDescription.length > 2000) {
    return res.render('create', { error: 'Description must be between 10 and 2000 characters.', categories: CATEGORIES });
  }

  // Validate category
  if (!CATEGORIES.includes(cleanCategory)) {
    return res.render('create', { error: 'Invalid category.', categories: CATEGORIES });
  }

  // Validate probability
  if (isNaN(prob) || prob < 1 || prob > 99) {
    return res.render('create', { error: 'Probability must be between 1 and 99.', categories: CATEGORIES });
  }

  // Validate stake
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.session.user.id);
  if (isNaN(stakeAmount) || stakeAmount < 1 || stakeAmount > user.credits) {
    return res.render('create', { error: 'Stake must be between 1 and your available credits (' + user.credits + ').', categories: CATEGORIES });
  }

  // Deduct stake from user's credits
  db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(stakeAmount, req.session.user.id);

  // Insert prediction
  const result = db.prepare(
    'INSERT INTO predictions (title, description, category, probability, stake, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(cleanTitle, cleanDescription, cleanCategory, prob, stakeAmount, req.session.user.id);

  // Update session credits
  req.session.user.credits = user.credits - stakeAmount;

  res.redirect('/predictions/' + result.lastInsertRowid);
});

// GET /predictions/:id
router.get('/predictions/:id', (req, res) => {
  const db = req.app.locals.db;
  const predictionId = parseInt(req.params.id, 10);

  if (isNaN(predictionId)) {
    return res.status(404).render('error', { title: 'Not Found', message: 'Prediction not found.' });
  }

  const prediction = db.prepare(
    `SELECT p.*, u.username as author_username, u.avatar_url as author_avatar
     FROM predictions p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = ?`
  ).get(predictionId);

  if (!prediction) {
    return res.status(404).render('error', { title: 'Not Found', message: 'Prediction not found.' });
  }

  // Increment views
  db.prepare('UPDATE predictions SET views = views + 1 WHERE id = ?').run(predictionId);

  // Fetch bets with usernames
  const bets = db.prepare(
    `SELECT b.*, u.username
     FROM bets b
     JOIN users u ON b.user_id = u.id
     WHERE b.prediction_id = ?
     ORDER BY b.created_at DESC`
  ).all(predictionId);

  // Calculate pool totals
  const pools = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN position = 'yes' THEN amount ELSE 0 END), 0) as yes_pool,
       COALESCE(SUM(CASE WHEN position = 'no' THEN amount ELSE 0 END), 0) as no_pool
     FROM bets WHERE prediction_id = ?`
  ).get(predictionId);

  // Calculate user's total bets on this prediction
  let userBetTotal = 0;
  if (req.session.user) {
    const userBets = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE prediction_id = ? AND user_id = ?'
    ).get(predictionId, req.session.user.id);
    userBetTotal = userBets.total;
  }

  res.render('prediction', {
    prediction,
    bets,
    yesPool: pools.yes_pool,
    noPool: pools.no_pool,
    totalPool: pools.yes_pool + pools.no_pool + prediction.stake,
    userBetTotal
  });
});

module.exports = router;
