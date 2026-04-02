const router = require('express').Router();
const bcrypt = require('bcryptjs');
const geo = require('geoip-lite');
const { signupLimiter } = require('../middleware/rateLimit');

const sanitize = (str) => String(str).replace(/<[^>]*>/g, '').trim();

function getIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function getCountry(ip) {
  const lookup = geo.lookup(ip);
  return lookup ? lookup.country : 'Unknown';
}

// GET /login
router.get('/login', (req, res) => {
  res.render('login', { error: null, returnTo: req.query.returnTo || '/' });
});

// GET /signup
router.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});

// POST /login
router.post('/login', (req, res) => {
  const db = req.app.locals.db;
  const { username, password, returnTo } = req.body;

  if (!username || !password) {
    return res.render('login', { error: 'Username and password are required.', returnTo: returnTo || '/' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(sanitize(username));

  if (!user) {
    return res.render('login', { error: 'Invalid username or password.', returnTo: returnTo || '/' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { error: 'Invalid username or password.', returnTo: returnTo || '/' });
  }

  if (user.role === 'banned') {
    return res.render('login', { error: 'Your account has been banned.' + (user.ban_reason ? ' Reason: ' + user.ban_reason : ''), returnTo: returnTo || '/' });
  }

  const ip = getIP(req);
  const country = getCountry(ip);
  const userAgent = req.headers['user-agent'] || '';

  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP, login_count = login_count + 1, ip_address = ?, country = ?, user_agent = ? WHERE id = ?')
    .run(ip, country, userAgent, user.id);

  req.session.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    credits: user.credits
  };

  res.redirect(returnTo || '/');
});

// POST /signup
router.post('/signup', signupLimiter, (req, res) => {
  const db = req.app.locals.db;
  const { username, email, password, confirmPassword } = req.body;

  const cleanUsername = sanitize(username || '');
  const cleanEmail = sanitize(email || '');

  // Validate username
  if (cleanUsername.length < 3 || cleanUsername.length > 20) {
    return res.render('signup', { error: 'Username must be between 3 and 20 characters.' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
    return res.render('signup', { error: 'Username can only contain letters, numbers, and underscores.' });
  }

  // Validate email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.render('signup', { error: 'Please enter a valid email address.' });
  }

  // Validate password
  if (!password || password.length < 8) {
    return res.render('signup', { error: 'Password must be at least 8 characters long.' });
  }

  // Check uniqueness
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
  if (existingUser) {
    return res.render('signup', { error: 'Username is already taken.' });
  }

  const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existingEmail) {
    return res.render('signup', { error: 'Email is already registered.' });
  }

  // Check IP registration limit
  const ip = getIP(req);
  const ipCount = db.prepare('SELECT COUNT(*) as count FROM ip_registrations WHERE ip_address = ?').get(ip);
  if (ipCount && ipCount.count >= 2) {
    return res.render('signup', { error: 'Maximum number of accounts reached for this IP address.' });
  }

  const country = getCountry(ip);
  const userAgent = req.headers['user-agent'] || '';
  const passwordHash = bcrypt.hashSync(password, 12);

  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash, ip_address, country, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(cleanUsername, cleanEmail, passwordHash, ip, country, userAgent);

  const userId = result.lastInsertRowid;

  // Record IP registration
  db.prepare('INSERT INTO ip_registrations (ip_address, user_id) VALUES (?, ?)').run(ip, userId);

  // Fetch new user for session
  const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  req.session.user = {
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    role: newUser.role,
    credits: newUser.credits
  };

  res.redirect('/');
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
