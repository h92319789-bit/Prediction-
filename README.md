# 🔮 Predictions

A full-stack virtual-credit prediction platform where users create predictions about future events, stake virtual credits, and bet on outcomes. Features account management, an admin dashboard, leaderboards, and a complete moderation system.

**⚠️ This is a virtual-credit platform only. No real money, gambling, deposits, or withdrawals are involved.**

---

## ✨ Features

### For Users
- **Create predictions** with title, description, category, probability estimate, and credit stake
- **Bet on predictions** — wager virtual credits on Yes/No outcomes
- **Virtual credit economy** — every new user starts with 50 credits
- **User profiles** — track your predictions, bets, accuracy, and earnings
- **Leaderboard** — ranked by credits and prediction accuracy
- **Notifications** — get notified when someone bets on your prediction or when outcomes are resolved
- **Search & filter** — find predictions by category, keyword, or sort by popularity/stake

### For Admins
- **Admin dashboard** — total users, predictions, bets, and credit circulation stats
- **User management** — view all users with IP, country, device metadata; edit credits, roles, bans
- **Prediction management** — resolve, lock, or cancel predictions with full payout distribution
- **Audit log** — every admin action is logged with timestamps and details
- **Moderation** — ban, shadow-ban, or lock accounts and predictions

### Security
- Password hashing with bcrypt (12 rounds)
- CSRF protection on all forms
- Rate limiting (auth, signup, prediction creation, bets, API)
- Session protection with secure cookies
- Helmet security headers
- IP-based multi-account prevention (max 2 accounts per IP)
- Input sanitization and validation
- Shadow-ban system for silent moderation

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express.js |
| **Database** | SQLite (via better-sqlite3) |
| **Templating** | EJS |
| **Auth** | express-session, bcryptjs |
| **Security** | Helmet, csrf-sync, express-rate-limit |
| **Geo** | geoip-lite |
| **Frontend** | Vanilla CSS + JS, Font Awesome, Inter font |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or later
- npm (included with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/predictions.git
cd predictions

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start the server
npm start
```

The server will start at **http://localhost:3000**

### Development Mode (auto-restart on changes)
```bash
npm run dev
```

---

## 🔑 Admin Access

A built-in admin account is created on first run:

| Field | Value |
|-------|-------|
|

The admin dashboard is available at `/admin` after logging in with this account.

### Admin Capabilities
- View all user data including IP addresses, countries, and device info
- Edit user credits and roles (ban, shadow-ban, unban)
- Resolve predictions (Yes/No) with automatic payout distribution
- Lock or cancel predictions (with full refunds on cancel)
- View complete audit log of all admin actions

---

## 📁 Project Structure

```
predictions/
├── server.js              # Express app, middleware, and main route
├── package.json           # Dependencies and scripts
├── .env.example           # Environment config template
├── .gitignore
├── database/
│   └── schema.sql         # SQLite schema with tables, indexes, and seed data
├── middleware/
│   ├── auth.js            # requireLogin, requireAdmin, isShadowBanned
│   └── rateLimit.js       # Rate limiters for auth, signup, bets, API
├── routes/
│   ├── auth.js            # Login, signup, logout
│   ├── predictions.js     # Create and view predictions
│   ├── bets.js            # Place bets
│   ├── users.js           # Profiles, leaderboard, notifications
│   ├── admin.js           # Admin dashboard and management
│   └── api.js             # JSON API endpoints
├── views/
│   ├── partials/
│   │   ├── header.ejs     # Navbar and HTML head
│   │   └── footer.ejs     # Footer and scripts
│   ├── home.ejs           # Prediction feed with filters
│   ├── login.ejs          # Login form
│   ├── signup.ejs         # Registration form
│   ├── create.ejs         # Create prediction form
│   ├── prediction.ejs     # Prediction detail + bet form
│   ├── profile.ejs        # User profile
│   ├── edit-profile.ejs   # Edit profile form
│   ├── leaderboard.ejs    # Rankings
│   ├── notifications.ejs  # User notifications
│   ├── error.ejs          # Error page
│   └── admin/
│       ├── dashboard.ejs  # Admin overview
│       ├── users.ejs      # User management list
│       ├── user-detail.ejs # User detail + edit
│       ├── predictions.ejs # Prediction management
│       └── audit.ejs      # Audit log viewer
└── public/
    ├── css/
    │   └── style.css      # Full responsive dark-theme CSS
    └── js/
        └── app.js         # Client-side interactivity
```

---

## 📊 Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Accounts, credentials, credits, roles, metadata |
| `predictions` | Prediction posts with stakes and status |
| `bets` | User bets on predictions |
| `notifications` | User notification queue |
| `audit_logs` | Admin action history |
| `ip_registrations` | Multi-account prevention tracking |

---

## 🎮 How It Works

1. **Sign up** — create an account and receive 50 starting credits
2. **Create a prediction** — write your prediction, set a probability, and stake credits
3. **Others bet** — users bet Yes or No using their own credits
4. **Resolution** — an admin resolves the prediction as Yes or No
5. **Payouts** — credits are distributed proportionally to winners from the total pool

### Payout Formula
- **Total Pool** = all bet amounts + creator's stake
- **Winner Share** = (your bet / total winning bets) × total pool

---

## 🔒 Security Features

- Bcrypt password hashing (12 rounds)
- CSRF tokens on all forms
- Rate limiting on auth (10/15min), signup (3/hr), predictions (20/hr), bets (30/min)
- Helmet security headers (CSP, HSTS, etc.)
- Secure session cookies (httpOnly, sameSite)
- IP-based registration limits (2 accounts per IP)
- Input sanitization (HTML tag stripping)
- Shadow-ban system (user sees their own content but others don't)
- Admin audit logging

---

## 📄 License

This project is for educational and entertainment purposes. Virtual credits have no real-world monetary value.
