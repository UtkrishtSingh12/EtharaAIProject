const express = require('express');
const db = require('./db');
const { authenticate, requireAdmin } = require('./middleware');

const router = express.Router();
router.use(authenticate);

// GET /api/dashboard - personal dashboard stats
router.get('/dashboard', (req, res) => {
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  // Projects accessible to user
  const projectFilter = isAdmin
    ? ''
    : `WHERE p.owner_id = ${userId} OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ${userId})`;

  const projects = db.prepare(`SELECT COUNT(*) as count FROM projects p ${projectFilter}`).get();

  // Tasks assigned to user (or all if admin)
  const taskFilter = isAdmin ? '' : `WHERE assignee_id = ${userId} OR creator_id = ${userId}`;
  const taskStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='todo' THEN 1 ELSE 0 END) as todo,
      SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status='review' THEN 1 ELSE 0 END) as review,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN due_date < date('now') AND status != 'done' THEN 1 ELSE 0 END) as overdue
    FROM tasks ${taskFilter}
  `).get();

  // Recent tasks
  const recentTasks = db.prepare(`
    SELECT t.*, u.name as assignee_name, p.name as project_name,
      CASE WHEN t.due_date < date('now') AND t.status != 'done' THEN 1 ELSE 0 END as is_overdue
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN projects p ON t.project_id = p.id
    ${isAdmin ? '' : `WHERE t.assignee_id = ${userId} OR t.creator_id = ${userId}`}
    ORDER BY t.updated_at DESC LIMIT 10
  `).all();

  // Overdue tasks
  const overdueTasks = db.prepare(`
    SELECT t.*, u.name as assignee_name, p.name as project_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN projects p ON t.project_id = p.id
    WHERE t.due_date < date('now') AND t.status != 'done'
    ${isAdmin ? '' : `AND (t.assignee_id = ${userId} OR t.creator_id = ${userId})`}
    ORDER BY t.due_date ASC LIMIT 5
  `).all();

  // Admin extras
  let adminStats = null;
  if (isAdmin) {
    adminStats = {
      totalUsers: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      totalProjects: db.prepare('SELECT COUNT(*) as count FROM projects').get().count,
      totalTasks: db.prepare('SELECT COUNT(*) as count FROM tasks').get().count,
    };
  }

  res.json({ projects: projects.count, taskStats, recentTasks, overdueTasks, adminStats });
});

// GET /api/users - list all users (admin only or for member search)
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, avatar, created_at FROM users ORDER BY name').all();
  res.json({ users });
});

// PUT /api/users/:id/role - admin only
router.put('/users/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' });

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  const user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(req.params.id);
  res.json({ user });
});

// DELETE /api/users/:id - admin only
router.delete('/users/:id', requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deleted' });
});

// PUT /api/profile - update own profile
router.put('/profile', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=4f46e5`;
  db.prepare('UPDATE users SET name = ?, avatar = ? WHERE id = ?').run(name.trim(), avatar, req.user.id);
  const user = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// GET /api/tasks/my - all tasks assigned to me
router.get('/my-tasks', (req, res) => {
  const tasks = db.prepare(`
    SELECT t.*, p.name as project_name, u.name as assignee_name,
      CASE WHEN t.due_date < date('now') AND t.status != 'done' THEN 1 ELSE 0 END as is_overdue
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.assignee_id = ? OR t.creator_id = ?
    ORDER BY t.due_date ASC, t.priority DESC
  `).all(req.user.id, req.user.id);
  res.json({ tasks });
});

module.exports = router;
