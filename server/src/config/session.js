const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./db');

const sessionConfig = {
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
};

module.exports = session(sessionConfig);
