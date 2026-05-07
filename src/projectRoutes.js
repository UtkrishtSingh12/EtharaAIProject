const express = require('express');
const { db } = require('./db');
const { authenticate, requireProjectAccess } = require('./middleware');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    let projects;
    if (req.user.role === 'admin') {
      projects = await db.all(`SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) as task_count,
        (SELECT COUNT(*) FROM project_members WHERE project_id=p.id) as member_count
        FROM projects p JOIN users u ON p.owner_id=u.id ORDER BY p.created_at DESC`);
    } else {
      projects = await db.all(`SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) as task_count,
        (SELECT COUNT(*) FROM project_members WHERE project_id=p.id) as member_count
        FROM projects p JOIN users u ON p.owner_id=u.id
        WHERE p.owner_id=? OR p.id IN (SELECT project_id FROM project_members WHERE user_id=?)
        ORDER BY p.created_at DESC`, [req.user.id, req.user.id]);
    }
    res.json({ projects });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });
    const result = await db.run('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)',
      [name.trim(), description || null, req.user.id]);
    await db.run('INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
      [result.lastInsertRowid, req.user.id, 'admin']);
    const project = await db.get('SELECT * FROM projects WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', requireProjectAccess, async (req, res) => {
  try {
    const project = await db.get(`SELECT p.*, u.name as owner_name, u.email as owner_email
      FROM projects p JOIN users u ON p.owner_id=u.id WHERE p.id=?`, [req.params.id]);
    const members = await db.all(`SELECT u.id, u.name, u.email, u.avatar, pm.role, pm.joined_at
      FROM project_members pm JOIN users u ON pm.user_id=u.id WHERE pm.project_id=?`, [req.params.id]);
    const stats = await db.get(`SELECT COUNT(*) as total,
      SUM(CASE WHEN status='todo' THEN 1 ELSE 0 END) as todo,
      SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status='review' THEN 1 ELSE 0 END) as review,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN due_date < date('now') AND status!='done' THEN 1 ELSE 0 END) as overdue
      FROM tasks WHERE project_id=?`, [req.params.id]);
    res.json({ project, members, stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireProjectAccess, async (req, res) => {
  try {
    if (!req.isProjectAdmin) return res.status(403).json({ error: 'Project admin access required' });
    const { name, description, status } = req.body;
    await db.run(`UPDATE projects SET name=COALESCE(?,name), description=COALESCE(?,description), status=COALESCE(?,status) WHERE id=?`,
      [name?.trim()||null, description, status||null, req.params.id]);
    const project = await db.get('SELECT * FROM projects WHERE id=?', [req.params.id]);
    res.json({ project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireProjectAccess, async (req, res) => {
  try {
    if (!req.isProjectAdmin) return res.status(403).json({ error: 'Project admin access required' });
    await db.run('DELETE FROM projects WHERE id=?', [req.params.id]);
    res.json({ message: 'Project deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/members', requireProjectAccess, async (req, res) => {
  try {
    if (!req.isProjectAdmin) return res.status(403).json({ error: 'Project admin access required' });
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'User email is required' });
    const user = await db.get('SELECT id, name, email, avatar FROM users WHERE email=?', [email.toLowerCase()]);
    if (!user) return res.status(404).json({ error: 'User not found with this email' });
    await db.run('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
      [req.params.id, user.id, role==='admin'?'admin':'member']);
    res.status(201).json({ message: 'Member added', user });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'User is already a member' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/members/:userId', requireProjectAccess, async (req, res) => {
  try {
    if (!req.isProjectAdmin) return res.status(403).json({ error: 'Project admin access required' });
    if (req.project.owner_id === parseInt(req.params.userId))
      return res.status(400).json({ error: 'Cannot remove project owner' });
    await db.run('DELETE FROM project_members WHERE project_id=? AND user_id=?', [req.params.id, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
