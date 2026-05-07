const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { JWT_SECRET, authenticate } = require('./middleware');

const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const count = await db.get('SELECT COUNT(*) as count FROM users');
    const assignedRole = count.count === 0 ? 'admin' : (role === 'admin' ? 'admin' : 'member');
    const hashed = bcrypt.hashSync(password, 10);
    const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=4f46e5`;

    const result = await db.run('INSERT INTO users (name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?)',
      [name, email.toLowerCase(), hashed, assignedRole, avatar]);

    const user = await db.get('SELECT id, name, email, role, avatar FROM users WHERE id = ?', [result.lastInsertRowid]);
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
