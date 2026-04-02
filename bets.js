const router = require('express').Router();
const { requireLogin } = require('../middleware/auth');
const { betLimiter } = require('../middleware/rateLimit');

// POST /predictions/:id/bet
router.post('/predictions/:id/bet', requireLogin, betLimiter, (req, res) => {
  const db = req.app.locals.db;
  const predictionId = parseInt(req.params.id, 10);
  const { position, amount } = req.body;
  const betAmount = parseInt(amount, 10);

  if (isNaN(predictionId)) {
    return res.status(404).render('error', { message: 'Prediction not found.' });
  }

  // Validate position
  if (position !== 'yes' && position !== 'no') {
    return res.redirect('/predictions/' + predictionId + '?error=Invalid+position');
  }

  // Fetch user's current credits
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.session.user.id);

  // Validate amount
  if (isNaN(betAmount) || betAmount < 1 || betAmount > user.credits || betAmount > 500) {
    return res.redirect('/predictions/' + predictionId + '?error=Invalid+bet+amount.+Max+500+per+bet.');
  }

  // Check prediction exists and is active
  const prediction = db.prepare('SELECT * FROM predictions WHERE id = ?').get(predictionId);
  if (!prediction) {
    return res.status(404).render('error', { message: 'Prediction not found.' });
  }
  if (prediction.status !== 'active') {
    return res.redirect('/predictions/' + predictionId + '?error=This+prediction+is+no+longer+active.');
  }

  // Prevent betting on own prediction
  if (prediction.user_id === req.session.user.id) {
    return res.redirect('/predictions/' + predictionId + '?error=You+cannot+bet+on+your+own+prediction.');
  }

  // Check total bets on this prediction by this user
  const totalBets = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE prediction_id = ? AND user_id = ?'
  ).get(predictionId, req.session.user.id);

  if (totalBets.total + betAmount > 1000) {
    return res.redirect('/predictions/' + predictionId + '?error=Maximum+total+bet+of+1000+per+prediction+exceeded.');
  }

  // Deduct credits
  db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(betAmount, req.session.user.id);

  // Insert bet
  db.prepare(
    'INSERT INTO bets (prediction_id, user_id, position, amount) VALUES (?, ?, ?, ?)'
  ).run(predictionId, req.session.user.id, position, betAmount);

  // Update session credits
  req.session.user.credits = user.credits - betAmount;

  // Create notification for prediction creator
  db.prepare(
    'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)'
  ).run(
    prediction.user_id,
    'bet',
    req.session.user.username + ' placed a ' + betAmount + ' credit ' + position.toUpperCase() + ' bet on your prediction.',
    '/predictions/' + predictionId
  );

  res.redirect('/predictions/' + predictionId);
});

module.exports = router;
