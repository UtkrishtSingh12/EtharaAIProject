# ⚡ TaskFlow — Team Task Manager

A full-stack team task management app with role-based access control, project management, and real-time task tracking.

## 🚀 Live Demo
> Deploy to Railway (see below) and add your URL here.

## 🛠️ Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) — zero config, file-based |
| Auth | JWT + bcryptjs |
| Frontend | Vanilla JS SPA — no build step needed |
| Deploy | Railway |

## ✨ Features
- **Authentication** — JWT-based Signup/Login, auto-persisted sessions
- **Role-Based Access Control** — Global Admin vs Member; Project-level Admin vs Member
- **Projects** — Create, edit, archive, delete. Add/remove team members with roles
- **Tasks** — Kanban board (To Do / In Progress / Review / Done) + list view
- **Task Details** — Assign, due date, priority (Low/Medium/High/Urgent), comments
- **Dashboard** — Personal stats, progress bar, overdue alerts, recent activity
- **Admin Panel** — Manage all users, change roles, delete users
- **Overdue Detection** — Visual red highlights on overdue tasks

---

## 💻 Local Setup (3 steps)

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open browser
open http://localhost:3000
```

**First user to register becomes Admin automatically.**

### Dev mode (auto-restart):
```bash
npm run dev
```

---

## 🌐 Deploy to Railway

### Option A: GitHub + Railway (Recommended)

1. Push this project to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/taskflow.git
git push -u origin main
```

2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select your repo — Railway auto-detects Node.js and deploys
4. Your app is live! Copy the URL from the Railway dashboard.

### Option B: Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Environment Variables (Optional)
Set in Railway dashboard → Variables:
```
JWT_SECRET=your_super_secret_key_here_change_this
PORT=3000
```

---

## 📁 Project Structure

```
taskflow/
├── src/
│   ├── server.js        # Express entry point
│   ├── db.js            # SQLite schema + connection
│   ├── middleware.js    # JWT auth + RBAC middleware
│   ├── authRoutes.js    # POST /api/auth/signup, /login, GET /me
│   ├── projectRoutes.js # CRUD projects + member management
│   ├── taskRoutes.js    # CRUD tasks + comments
│   └── userRoutes.js    # Dashboard, users, profile
├── public/
│   └── index.html       # Complete SPA frontend
├── railway.json         # Railway deployment config
├── package.json
└── README.md
```

---

## 📡 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List my projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project + members + stats |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/projects/:id/members` | Add member |
| DELETE | `/api/projects/:id/members/:userId` | Remove member |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:pid/tasks` | List tasks (filterable) |
| POST | `/api/projects/:pid/tasks` | Create task |
| GET | `/api/projects/:pid/tasks/:id` | Get task + comments |
| PUT | `/api/projects/:pid/tasks/:id` | Update task |
| DELETE | `/api/projects/:pid/tasks/:id` | Delete task |
| POST | `/api/projects/:pid/tasks/:id/comments` | Add comment |

### Dashboard & Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Personal dashboard stats |
| GET | `/api/my-tasks` | Tasks assigned to me |
| GET | `/api/users` | All users (auth required) |
| PUT | `/api/users/:id/role` | Change user role (admin only) |
| DELETE | `/api/users/:id` | Delete user (admin only) |
| PUT | `/api/profile` | Update own profile |

---

## 🔐 RBAC Rules

| Action | Global Admin | Project Admin | Member |
|--------|-------------|---------------|--------|
| View all projects | ✅ | — | — |
| Create project | ✅ | ✅ | ✅ |
| Edit/Delete project | ✅ | ✅ | ❌ |
| Add/Remove members | ✅ | ✅ | ❌ |
| Create tasks | ✅ | ✅ | ✅ |
| Edit own tasks | ✅ | ✅ | ✅ |
| Edit any task | ✅ | ✅ | ❌ |
| Manage all users | ✅ | ❌ | ❌ |

---

## 🧪 Quick Test Accounts
After first signup (auto-admin), create a second account as Member to test RBAC.
