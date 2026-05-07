const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { JWT_SECRET } = require('./middleware');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email, and password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Invalid email format' });

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) return res.status(409).json({ error: 'Email already registered' });

  // First user becomes admin automatically
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const assignedRole = userCount.count === 0 ? 'admin' : (role === 'admin' ? 'admin' : 'member');

  const hashedPassword = bcrypt.hashSync(password, 10);
  const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=4f46e5`;

  const result = db.prepare(
    'INSERT INTO users (name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email.toLowerCase(), hashedPassword, assignedRole, avatar);

  const user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({ user, token });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...safeUser } = user;

  res.json({ user: safeUser, token });
});

// GET /api/auth/me
router.get('/me', require('./middleware').authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
