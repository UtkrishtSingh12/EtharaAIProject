const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'taskflow_super_secret_key_change_in_production';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireProjectAccess = (req, res, next) => {
  const projectId = req.params.projectId || req.params.id;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const isOwner = project.owner_id === req.user.id;
  const isMember = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, req.user.id);
  const isGlobalAdmin = req.user.role === 'admin';

  if (!isOwner && !isMember && !isGlobalAdmin) {
    return res.status(403).json({ error: 'Access denied to this project' });
  }
  req.project = project;
  req.isProjectAdmin = isOwner || isGlobalAdmin || (isMember && isMember.role === 'admin');
  next();
};

module.exports = { authenticate, requireAdmin, requireProjectAccess, JWT_SECRET };
