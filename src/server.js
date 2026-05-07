const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API routes FIRST
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() });
});
app.use('/api/auth', require('./authRoutes'));
app.use('/api/projects', require('./projectRoutes'));
app.use('/api/projects/:projectId/tasks', require('./taskRoutes'));
app.use('/api', require('./userRoutes'));

// Static + SPA fallback AFTER
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TaskFlow running on port ${PORT}`);
});
