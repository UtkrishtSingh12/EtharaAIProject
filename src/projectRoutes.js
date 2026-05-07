const express = require('express');
const db = require('./db');
const { authenticate, requireProjectAccess } = require('./middleware');

const router = express.Router();
router.use(authenticate);

// GET /api/projects - list projects accessible to user
router.get('/', (req, res) => {
  let projects;
  if (req.user.role === 'admin') {
    projects = db.prepare(`
      SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
      FROM projects p
      JOIN users u ON p.owner_id = u.id
      ORDER BY p.created_at DESC
    `).all();
  } else {
    projects = db.prepare(`
      SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
      FROM projects p
      JOIN users u ON p.owner_id = u.id
      WHERE p.owner_id = ? OR p.id IN (
        SELECT project_id FROM project_members WHERE user_id = ?
      )
      ORDER BY p.created_at DESC
    `).all(req.user.id, req.user.id);
  }
  res.json({ projects });
});

// POST /api/projects - create project (any authenticated user)
router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });

  const result = db.prepare(
    'INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)'
  ).run(name.trim(), description || null, req.user.id);

  // Owner is also a member with admin role
  db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)')
    .run(result.lastInsertRowid, req.user.id, 'admin');

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ project });
});

// GET /api/projects/:id
router.get('/:id', requireProjectAccess, (req, res) => {
  const project = db.prepare(`
    SELECT p.*, u.name as owner_name, u.email as owner_email
    FROM projects p JOIN users u ON p.owner_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar, pm.role, pm.joined_at
    FROM project_members pm JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `).all(req.params.id);

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='todo' THEN 1 ELSE 0 END) as todo,
      SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status='review' THEN 1 ELSE 0 END) as review,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN due_date < date('now') AND status != 'done' THEN 1 ELSE 0 END) as overdue
    FROM tasks WHERE project_id = ?
  `).get(req.params.id);

  res.json({ project, members, stats });
});

// PUT /api/projects/:id
router.put('/:id', requireProjectAccess, (req, res) => {
  if (!req.isProjectAdmin) return res.status(403).json({ error: 'Project admin access required' });
  const { name, description, status } = req.body;
  if (name && !name.trim()) return res.status(400).json({ error: 'Project name cannot be empty' });

  db.prepare(`
    UPDATE projects SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      status = COALESCE(?, status)
    WHERE id = ?
  `).run(name?.trim() || null, description, status || null, req.params.id);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json({ project });
});

// DELETE /api/projects/:id
router.delete('/:id', requireProjectAccess, (req, res) => {
  if (!req.isProjectAdmin) return res.status(403).json({ error: 'Project admin access required' });
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ message: 'Project deleted' });
});

// POST /api/projects/:id/members - add member
router.post('/:id/members', requireProjectAccess, (req, res) => {
  if (!req.isProjectAdmin) return res.status(403).json({ error: 'Project admin access required' });
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'User email is required' });

  const user = db.prepare('SELECT id, name, email, avatar FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found with this email' });

  try {
    db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)')
      .run(req.params.id, user.id, role === 'admin' ? 'admin' : 'member');
    res.status(201).json({ message: 'Member added', user });
  } catch (e) {
    res.status(409).json({ error: 'User is already a member' });
  }
});

// DELETE /api/projects/:id/members/:userId
router.delete('/:id/members/:userId', requireProjectAccess, (req, res) => {
  if (!req.isProjectAdmin) return res.status(403).json({ error: 'Project admin access required' });
  if (req.project.owner_id === parseInt(req.params.userId))
    return res.status(400).json({ error: 'Cannot remove project owner' });

  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')
    .run(req.params.id, req.params.userId);
  res.json({ message: 'Member removed' });
});

module.exports = router;
