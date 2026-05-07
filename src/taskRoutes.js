const express = require('express');
const db = require('./db');
const { authenticate, requireProjectAccess } = require('./middleware');

const router = express.Router({ mergeParams: true });
router.use(authenticate);

// Helper: check task access
function getTaskWithAccess(taskId, userId, userRole) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return { error: 'Task not found', status: 404 };

  const isMember = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(task.project_id, userId);
  const isOwner = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(task.project_id);
  const hasAccess = userRole === 'admin' || (isMember) || (isOwner && isOwner.owner_id === userId);
  if (!hasAccess) return { error: 'Access denied', status: 403 };

  return { task, isMember, isAdmin: userRole === 'admin' || (isMember && isMember.role === 'admin') || (isOwner && isOwner.owner_id === userId) };
}

// GET /api/projects/:projectId/tasks
router.get('/', requireProjectAccess, (req, res) => {
  const { status, priority, assignee_id } = req.query;
  let query = `
    SELECT t.*,
      u1.name as assignee_name, u1.avatar as assignee_avatar,
      u2.name as creator_name,
      p.name as project_name,
      CASE WHEN t.due_date < date('now') AND t.status != 'done' THEN 1 ELSE 0 END as is_overdue
    FROM tasks t
    LEFT JOIN users u1 ON t.assignee_id = u1.id
    JOIN users u2 ON t.creator_id = u2.id
    JOIN projects p ON t.project_id = p.id
    WHERE t.project_id = ?
  `;
  const params = [req.params.projectId];

  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  if (assignee_id) { query += ' AND t.assignee_id = ?'; params.push(assignee_id); }

  query += ' ORDER BY CASE t.priority WHEN "urgent" THEN 1 WHEN "high" THEN 2 WHEN "medium" THEN 3 ELSE 4 END, t.created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json({ tasks });
});

// POST /api/projects/:projectId/tasks
router.post('/', requireProjectAccess, (req, res) => {
  const { title, description, status, priority, assignee_id, due_date } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required' });

  // Validate assignee is project member
  if (assignee_id) {
    const isMember = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(req.params.projectId, assignee_id);
    if (!isMember && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'Assignee must be a project member' });
    }
  }

  const result = db.prepare(`
    INSERT INTO tasks (title, description, status, priority, project_id, assignee_id, creator_id, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(), description || null,
    status || 'todo', priority || 'medium',
    req.params.projectId, assignee_id || null,
    req.user.id, due_date || null
  );

  const task = db.prepare(`
    SELECT t.*, u1.name as assignee_name, u1.avatar as assignee_avatar, u2.name as creator_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assignee_id = u1.id
    JOIN users u2 ON t.creator_id = u2.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ task });
});

// GET /api/tasks/:id (global task fetch)
router.get('/:id', (req, res) => {
  const { task, error, status } = getTaskWithAccess(req.params.id, req.user.id, req.user.role);
  if (error) return res.status(status).json({ error });

  const fullTask = db.prepare(`
    SELECT t.*, u1.name as assignee_name, u1.avatar as assignee_avatar,
      u2.name as creator_name, p.name as project_name
    FROM tasks t
    LEFT JOIN users u1 ON t.assignee_id = u1.id
    JOIN users u2 ON t.creator_id = u2.id
    JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(req.params.id);

  const comments = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar as user_avatar
    FROM comments c JOIN users u ON c.user_id = u.id
    WHERE c.task_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);

  res.json({ task: fullTask, comments });
});

// PUT /api/projects/:projectId/tasks/:id
router.put('/:id', requireProjectAccess, (req, res) => {
  const taskId = req.params.id;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const canEdit = req.isProjectAdmin || task.creator_id === req.user.id || task.assignee_id === req.user.id;
  if (!canEdit) return res.status(403).json({ error: 'You cannot edit this task' });

  const { title, description, status, priority, assignee_id, due_date } = req.body;

  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      assignee_id = CASE WHEN ? IS NOT NULL THEN ? ELSE assignee_id END,
      due_date = COALESCE(?, due_date),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title?.trim() || null, description, status || null, priority || null,
    assignee_id, assignee_id, due_date || null, taskId
  );

  const updated = db.prepare(`
    SELECT t.*, u1.name as assignee_name, u1.avatar as assignee_avatar, u2.name as creator_name
    FROM tasks t LEFT JOIN users u1 ON t.assignee_id = u1.id
    JOIN users u2 ON t.creator_id = u2.id WHERE t.id = ?
  `).get(taskId);

  res.json({ task: updated });
});

// DELETE /api/projects/:projectId/tasks/:id
router.delete('/:id', requireProjectAccess, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(req.params.id, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (!req.isProjectAdmin && task.creator_id !== req.user.id)
    return res.status(403).json({ error: 'Cannot delete this task' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Task deleted' });
});

// POST /api/projects/:projectId/tasks/:id/comments
router.post('/:id/comments', requireProjectAccess, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(req.params.id, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const result = db.prepare('INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)')
    .run(req.params.id, req.user.id, content.trim());

  const comment = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar as user_avatar
    FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ comment });
});

module.exports = router;
