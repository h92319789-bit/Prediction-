const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');

const sanitize = (str) => String(str).replace(/<[^>]*>/g, '').trim();

// All admin routes require admin
router.use(requireAdmin);

// GET /admin/
router.get('/', (req, res) => {
  const db = req.app.locals.db;

  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalPredictions = db.prepare('SELECT COUNT(*) as count FROM predictions').get().count;
  const totalBets = db.prepare('SELECT COUNT(*) as count FROM bets').get().count;
  const totalCredits = db.prepare('SELECT COALESCE(SUM(credits), 0) as total FROM users').get().total;

  const recentSignups = db.prepare(
    "SELECT id, username, email, created_at, ip_address, country FROM users WHERE created_at >= datetime('now', '-7 days') ORDER BY created_at DESC"
  ).all();

  const recentAuditLogs = db.prepare(
    `SELECT al.*, u.username as admin_username
     FROM audit_logs al
     LEFT JOIN users u ON al.admin_id = u.id
     ORDER BY al.created_at DESC
     LIMIT 20`
  ).all();

  // Predictions per day (last 30 days)
  const predictionsPerDay = db.prepare(
    `SELECT DATE(created_at) as date, COUNT(*) as count
     FROM predictions
     WHERE created_at >= datetime('now', '-30 days')
     GROUP BY DATE(created_at)
     ORDER BY date ASC`
  ).all();

  res.render('admin/dashboard', {
    stats: { totalUsers, totalPredictions, totalBets, totalCredits },
    recentUsers: recentSignups,
    recentLogs: recentAuditLogs,
    predictionsPerDay
  });
});

// GET /admin/users
router.get('/users', (req, res) => {
  const db = req.app.locals.db;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;
  const search = sanitize(req.query.search || '');
  const roleFilter = sanitize(req.query.role || '');

  let whereClause = '1=1';
  const params = [];

  if (search) {
    whereClause += ' AND (username LIKE ? OR email LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }

  if (roleFilter) {
    whereClause += ' AND role = ?';
    params.push(roleFilter);
  }

  const total = db.prepare('SELECT COUNT(*) as count FROM users WHERE ' + whereClause).get(...params).count;

  const users = db.prepare(
    'SELECT id, username, email, credits, role, ip_address, country, created_at, last_login, login_count FROM users WHERE ' + whereClause + ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(...params, limit, offset);

  const totalPages = Math.ceil(total / limit);

  res.render('admin/users', {
    users,
    page,
    totalPages,
    total,
    search,
    roleFilter
  });
});

// GET /admin/users/:id
router.get('/users/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = parseInt(req.params.id, 10);

  if (isNaN(userId)) {
    return res.status(404).render('error', { message: 'User not found.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).render('error', { message: 'User not found.' });
  }

  const predictions = db.prepare(
    'SELECT * FROM predictions WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId);

  const bets = db.prepare(
    `SELECT b.*, p.title as prediction_title
     FROM bets b
     JOIN predictions p ON b.prediction_id = p.id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC`
  ).all(userId);

  const auditLogs = db.prepare(
    `SELECT al.*, u.username as admin_username
     FROM audit_logs al
     LEFT JOIN users u ON al.admin_id = u.id
     WHERE al.target_id = ? AND al.target_type = 'user'
     ORDER BY al.created_at DESC`
  ).all(userId);

  res.render('admin/user-detail', {
    targetUser: user,
    predictions,
    bets,
    auditLogs
  });
});

// POST /admin/users/:id/edit
router.post('/users/:id/edit', (req, res) => {
  const db = req.app.locals.db;
  const userId = parseInt(req.params.id, 10);

  if (isNaN(userId)) {
    return res.status(404).render('error', { message: 'User not found.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).render('error', { message: 'User not found.' });
  }

  const { credits, role, bio, ban_reason } = req.body;
  const newCredits = parseInt(credits, 10);
  const newRole = sanitize(role || user.role);
  const newBio = sanitize(bio || '');
  const newBanReason = sanitize(ban_reason || '');

  const allowedRoles = ['user', 'admin', 'banned', 'shadowbanned'];
  if (!allowedRoles.includes(newRole)) {
    return res.redirect('/admin/users/' + userId + '?error=Invalid+role');
  }

  const changes = {};
  if (!isNaN(newCredits) && newCredits !== user.credits) {
    changes.credits = { from: user.credits, to: newCredits };
  }
  if (newRole !== user.role) {
    changes.role = { from: user.role, to: newRole };
  }
  if (newBio !== (user.bio || '')) {
    changes.bio = { from: user.bio, to: newBio };
  }
  if (newBanReason !== (user.ban_reason || '')) {
    changes.ban_reason = { from: user.ban_reason, to: newBanReason };
  }

  db.prepare(
    'UPDATE users SET credits = ?, role = ?, bio = ?, ban_reason = ? WHERE id = ?'
  ).run(
    isNaN(newCredits) ? user.credits : newCredits,
    newRole,
    newBio,
    newBanReason,
    userId
  );

  // Log action in audit_logs
  db.prepare(
    'INSERT INTO audit_logs (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
  ).run(
    req.session.user.id,
    'edit_user',
    'user',
    userId,
    JSON.stringify(changes)
  );

  res.redirect('/admin/users/' + userId);
});

// GET /admin/predictions
router.get('/predictions', (req, res) => {
  const db = req.app.locals.db;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;
  const search = sanitize(req.query.search || '');
  const statusFilter = sanitize(req.query.status || '');

  let whereClause = '1=1';
  const params = [];

  if (search) {
    whereClause += ' AND p.title LIKE ?';
    params.push('%' + search + '%');
  }

  if (statusFilter) {
    whereClause += ' AND p.status = ?';
    params.push(statusFilter);
  }

  const total = db.prepare(
    'SELECT COUNT(*) as count FROM predictions p WHERE ' + whereClause
  ).get(...params).count;

  const predictions = db.prepare(
    `SELECT p.*, u.username as creator_username
     FROM predictions p
     JOIN users u ON p.user_id = u.id
     WHERE ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  const totalPages = Math.ceil(total / limit);

  res.render('admin/predictions', {
    predictions,
    page,
    totalPages,
    total,
    search,
    statusFilter
  });
});

// POST /admin/predictions/:id/resolve
router.post('/predictions/:id/resolve', (req, res) => {
  const db = req.app.locals.db;
  const predictionId = parseInt(req.params.id, 10);
  const { resolution, resolution_note } = req.body;

  if (isNaN(predictionId)) {
    return res.status(404).render('error', { message: 'Prediction not found.' });
  }

  if (resolution !== 'resolved_yes' && resolution !== 'resolved_no') {
    return res.redirect('/admin/predictions?error=Invalid+resolution');
  }

  const prediction = db.prepare('SELECT * FROM predictions WHERE id = ?').get(predictionId);
  if (!prediction) {
    return res.status(404).render('error', { message: 'Prediction not found.' });
  }

  if (prediction.status !== 'active' && prediction.status !== 'locked') {
    return res.redirect('/admin/predictions?error=Prediction+cannot+be+resolved+in+current+status');
  }

  const cleanNote = sanitize(resolution_note || '');

  // Begin transaction
  const resolveTransaction = db.transaction(() => {
    // Update prediction status
    db.prepare(
      'UPDATE predictions SET status = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, resolution_note = ? WHERE id = ?'
    ).run(resolution, req.session.user.id, cleanNote, predictionId);

    // Fetch all bets
    const bets = db.prepare('SELECT * FROM bets WHERE prediction_id = ?').all(predictionId);

    // Determine winners and losers
    const winningPosition = resolution === 'resolved_yes' ? 'yes' : 'no';
    const winningBets = bets.filter(b => b.position === winningPosition);
    const losingBets = bets.filter(b => b.position !== winningPosition);

    const totalPool = bets.reduce((sum, b) => sum + b.amount, 0) + prediction.stake;
    const totalWinningAmount = winningBets.reduce((sum, b) => sum + b.amount, 0);

    // Update losing bets
    for (const bet of losingBets) {
      db.prepare('UPDATE bets SET status = ?, payout = 0 WHERE id = ?').run('lost', bet.id);
    }

    // Calculate and distribute payouts to winners
    if (totalWinningAmount > 0) {
      for (const bet of winningBets) {
        const payout = Math.floor((bet.amount / totalWinningAmount) * totalPool);
        db.prepare('UPDATE bets SET status = ?, payout = ? WHERE id = ?').run('won', payout, bet.id);
        db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(payout, bet.user_id);

        // Notify winner
        db.prepare(
          'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)'
        ).run(
          bet.user_id,
          'payout',
          'You won ' + payout + ' credits on prediction: ' + prediction.title,
          '/predictions/' + predictionId
        );
      }
    } else {
      // No winning bets - creator gets stake back, losing bets already handled
      // If no one bet on the winning side, refund stake to creator
      db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?')
        .run(prediction.stake, prediction.user_id);
    }

    // Handle creator stake: creator wins back stake if prediction resolved in their favor
    // Creator "wins" if they set probability > 50 and resolved YES, or probability < 50 and resolved NO
    const creatorWins = (prediction.probability > 50 && resolution === 'resolved_yes') ||
                        (prediction.probability < 50 && resolution === 'resolved_no');

    if (creatorWins && totalWinningAmount > 0) {
      // Creator gets stake back as a bonus (on top of any bet winnings)
      db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?')
        .run(prediction.stake, prediction.user_id);

      db.prepare(
        'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)'
      ).run(
        prediction.user_id,
        'resolution',
        'Your prediction was resolved in your favor! You received your ' + prediction.stake + ' credit stake back.',
        '/predictions/' + predictionId
      );
    } else {
      // Notify creator that their prediction was resolved
      db.prepare(
        'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)'
      ).run(
        prediction.user_id,
        'resolution',
        'Your prediction "' + prediction.title + '" has been resolved as ' + (resolution === 'resolved_yes' ? 'YES' : 'NO') + '.',
        '/predictions/' + predictionId
      );
    }

    // Notify losers
    for (const bet of losingBets) {
      db.prepare(
        'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)'
      ).run(
        bet.user_id,
        'payout',
        'You lost ' + bet.amount + ' credits on prediction: ' + prediction.title,
        '/predictions/' + predictionId
      );
    }

    // Log in audit_logs
    db.prepare(
      'INSERT INTO audit_logs (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
    ).run(
      req.session.user.id,
      'resolve_prediction',
      'prediction',
      predictionId,
      JSON.stringify({
        resolution,
        resolution_note: cleanNote,
        total_pool: totalPool,
        winning_bets: winningBets.length,
        losing_bets: losingBets.length
      })
    );
  });

  resolveTransaction();

  res.redirect('/admin/predictions');
});

// POST /admin/predictions/:id/lock
router.post('/predictions/:id/lock', (req, res) => {
  const db = req.app.locals.db;
  const predictionId = parseInt(req.params.id, 10);

  if (isNaN(predictionId)) {
    return res.status(404).render('error', { message: 'Prediction not found.' });
  }

  const prediction = db.prepare('SELECT * FROM predictions WHERE id = ?').get(predictionId);
  if (!prediction) {
    return res.status(404).render('error', { message: 'Prediction not found.' });
  }

  const newStatus = prediction.status === 'active' ? 'locked' : 'active';

  db.prepare('UPDATE predictions SET status = ? WHERE id = ?').run(newStatus, predictionId);

  db.prepare(
    'INSERT INTO audit_logs (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
  ).run(
    req.session.user.id,
    newStatus === 'locked' ? 'lock_prediction' : 'unlock_prediction',
    'prediction',
    predictionId,
    JSON.stringify({ previous_status: prediction.status, new_status: newStatus })
  );

  res.redirect('/admin/predictions');
});

// POST /admin/predictions/:id/cancel
router.post('/predictions/:id/cancel', (req, res) => {
  const db = req.app.locals.db;
  const predictionId = parseInt(req.params.id, 10);

  if (isNaN(predictionId)) {
    return res.status(404).render('error', { message: 'Prediction not found.' });
  }

  const prediction = db.prepare('SELECT * FROM predictions WHERE id = ?').get(predictionId);
  if (!prediction) {
    return res.status(404).render('error', { message: 'Prediction not found.' });
  }

  const cancelTransaction = db.transaction(() => {
    // Set status to cancelled
    db.prepare('UPDATE predictions SET status = ? WHERE id = ?').run('cancelled', predictionId);

    // Refund all bets
    const bets = db.prepare('SELECT * FROM bets WHERE prediction_id = ?').all(predictionId);

    for (const bet of bets) {
      db.prepare('UPDATE bets SET status = ?, payout = ? WHERE id = ?').run('refunded', bet.amount, bet.id);
      db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(bet.amount, bet.user_id);

      // Notify bettor
      db.prepare(
        'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)'
      ).run(
        bet.user_id,
        'refund',
        'Your ' + bet.amount + ' credit bet on "' + prediction.title + '" has been refunded due to cancellation.',
        '/predictions/' + predictionId
      );
    }

    // Refund creator's stake
    db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(prediction.stake, prediction.user_id);

    // Notify creator
    db.prepare(
      'INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)'
    ).run(
      prediction.user_id,
      'refund',
      'Your prediction "' + prediction.title + '" has been cancelled. Your ' + prediction.stake + ' credit stake has been refunded.',
      '/predictions/' + predictionId
    );

    // Log in audit_logs
    db.prepare(
      'INSERT INTO audit_logs (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)'
    ).run(
      req.session.user.id,
      'cancel_prediction',
      'prediction',
      predictionId,
      JSON.stringify({
        refunded_bets: bets.length,
        total_refunded: bets.reduce((sum, b) => sum + b.amount, 0) + prediction.stake
      })
    );
  });

  cancelTransaction();

  res.redirect('/admin/predictions');
});

// GET /admin/audit
router.get('/audit', (req, res) => {
  const db = req.app.locals.db;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;
  const actionFilter = sanitize(req.query.action || '');

  let whereClause = '1=1';
  const params = [];

  if (actionFilter) {
    whereClause += ' AND al.action = ?';
    params.push(actionFilter);
  }

  const total = db.prepare(
    'SELECT COUNT(*) as count FROM audit_logs al WHERE ' + whereClause
  ).get(...params).count;

  const logs = db.prepare(
    `SELECT al.*, u.username as admin_username
     FROM audit_logs al
     LEFT JOIN users u ON al.admin_id = u.id
     WHERE ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  const totalPages = Math.ceil(total / limit);

  res.render('admin/audit', {
    logs,
    page,
    totalPages,
    total,
    actionFilter
  });
});

module.exports = router;
