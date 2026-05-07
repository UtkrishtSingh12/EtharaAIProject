const express = require('express');
const { db } = require('./db');
const { authenticate, requireAdmin } = require('./middleware');

const router = express.Router();
router.use(authenticate);

router.get('/dashboard', async (req, res) => {
  try {
    const uid = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const projCount = await db.get(isAdmin
      ? 'SELECT COUNT(*) as count FROM projects'
      : 'SELECT COUNT(*) as count FROM projects WHERE owner_id=? OR id IN (SELECT project_id FROM project_members WHERE user_id=?)',
      isAdmin ? [] : [uid, uid]);
    const taskStats = await db.get(`SELECT COUNT(*) as total,
      SUM(CASE WHEN status='todo' THEN 1 ELSE 0 END) as todo,
      SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status='review' THEN 1 ELSE 0 END) as review,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN due_date < date('now') AND status!='done' THEN 1 ELSE 0 END) as overdue
      FROM tasks ${isAdmin ? '' : 'WHERE assignee_id=? OR creator_id=?'}`,
      isAdmin ? [] : [uid, uid]);
    const recentTasks = await db.all(`SELECT t.*, u.name as assignee_name, p.name as project_name,
      CASE WHEN t.due_date < date('now') AND t.status!='done' THEN 1 ELSE 0 END as is_overdue
      FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id JOIN projects p ON t.project_id=p.id
      ${isAdmin ? '' : 'WHERE t.assignee_id=? OR t.creator_id=?'}
      ORDER BY t.updated_at DESC LIMIT 10`, isAdmin ? [] : [uid, uid]);
    const overdueTasks = await db.all(`SELECT t.*, u.name as assignee_name, p.name as project_name
      FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id JOIN projects p ON t.project_id=p.id
      WHERE t.due_date < date('now') AND t.status!='done'
      ${isAdmin ? '' : 'AND (t.assignee_id=? OR t.creator_id=?)'}
      ORDER BY t.due_date ASC LIMIT 5`, isAdmin ? [] : [uid, uid]);
    let adminStats = null;
    if (isAdmin) {
      const tu = await db.get('SELECT COUNT(*) as count FROM users');
      const tp = await db.get('SELECT COUNT(*) as count FROM projects');
      const tt = await db.get('SELECT COUNT(*) as count FROM tasks');
      adminStats = { totalUsers: tu.count, totalProjects: tp.count, totalTasks: tt.count };
    }
    res.json({ projects: projCount.count, taskStats, recentTasks, overdueTasks, adminStats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const users = await db.all('SELECT id, name, email, role, avatar, created_at FROM users ORDER BY name');
    res.json({ users });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin','member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' });
    await db.run('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
    const user = await db.get('SELECT id, name, email, role, avatar FROM users WHERE id=?', [req.params.id]);
    res.json({ user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await db.run('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/profile', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=4f46e5`;
    await db.run('UPDATE users SET name=?, avatar=? WHERE id=?', [name.trim(), avatar, req.user.id]);
    const user = await db.get('SELECT id, name, email, role, avatar FROM users WHERE id=?', [req.user.id]);
    res.json({ user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/my-tasks', async (req, res) => {
  try {
    const tasks = await db.all(`SELECT t.*, p.name as project_name, u.name as assignee_name,
      CASE WHEN t.due_date < date('now') AND t.status!='done' THEN 1 ELSE 0 END as is_overdue
      FROM tasks t JOIN projects p ON t.project_id=p.id LEFT JOIN users u ON t.assignee_id=u.id
      WHERE t.assignee_id=? OR t.creator_id=?
      ORDER BY t.due_date ASC`, [req.user.id, req.user.id]);
    res.json({ tasks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
