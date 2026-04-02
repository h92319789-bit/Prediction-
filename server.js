// Dependencies
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const { csrfSync } = require('csrf-sync');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const dbPath = path.join(__dirname, 'database', 'predictions.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema if tables don't exist
const schemaPath = path.join(__dirname, 'database', 'schema.sql');
if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()) {
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  console.log('Database schema initialized');
}

// Make db available globally
app.locals.db = db;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  }
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: path.join(__dirname, 'database')
  }),
  secret: process.env.SESSION_SECRET || 'predictions-secret-key-change-in-production-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax'
  }
}));

// CSRF Protection
const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => req.body['_csrf'] || req.headers['x-csrf-token'],
});

// Apply CSRF to all non-GET/HEAD/OPTIONS requests
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  csrfSynchronisedProtection(req, res, next);
});

// Generate CSRF token for all views
app.use((req, res, next) => {
  res.locals.csrfToken = generateToken(req);
  next();
});

// Make user available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Notification count middleware
app.use((req, res, next) => {
  if (req.session.user) {
    const count = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.session.user.id);
    res.locals.notificationCount = count ? count.count : 0;
  } else {
    res.locals.notificationCount = 0;
  }
  next();
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/predictions'));
app.use('/', require('./routes/bets'));
app.use('/', require('./routes/users'));
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

// Home route
app.get('/', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 12;
  const offset = (page - 1) * limit;
  const category = req.query.category || '';
  const search = req.query.search || '';
  const sort = req.query.sort || 'newest';

  let where = "WHERE p.status = 'active'";
  const params = [];

  if (category) {
    where += " AND p.category = ?";
    params.push(category);
  }
  if (search) {
    where += " AND (p.title LIKE ? OR p.description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  let orderBy = 'p.created_at DESC';
  if (sort === 'popular') orderBy = 'total_bets DESC, p.created_at DESC';
  if (sort === 'ending') orderBy = 'p.created_at ASC';
  if (sort === 'highest') orderBy = 'p.stake DESC';

  const countSql = `SELECT COUNT(*) as total FROM predictions p ${where}`;
  const total = db.prepare(countSql).get(...params).total;

  const sql = `
    SELECT p.*, u.username as author,
      (SELECT COUNT(*) FROM bets WHERE prediction_id = p.id) as total_bets,
      (SELECT COALESCE(SUM(amount), 0) FROM bets WHERE prediction_id = p.id) as total_pool
    FROM predictions p
    JOIN users u ON p.user_id = u.id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const predictions = db.prepare(sql).all(...params, limit, offset);
  const categories = db.prepare("SELECT DISTINCT category FROM predictions WHERE status = 'active' ORDER BY category").all();

  res.render('home', {
    predictions,
    categories: categories.map(c => c.category),
    currentCategory: category,
    currentSearch: search,
    currentSort: sort,
    page,
    totalPages: Math.ceil(total / limit),
    total
  });
});

// 404
app.use((req, res) => {
  res.status(404).render('error', { title: 'Page Not Found', message: 'The page you are looking for does not exist.', user: res.locals.user || null, csrfToken: res.locals.csrfToken || '', notificationCount: res.locals.notificationCount || 0 });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Server Error', message: 'Something went wrong. Please try again.', user: res.locals.user || null, csrfToken: res.locals.csrfToken || '', notificationCount: res.locals.notificationCount || 0 });
});

// Start server
app.listen(PORT, () => {
  console.log(`Predictions server running on http://localhost:${PORT}`);
});

module.exports = app;
