# Учёт растений — Telegram Mini App

Node.js + Express + Postgres (Cursor Apps) / PGlite locally + Vanilla JS.

```bash
npm install
env -u DATABASE_URL npm start   # http://localhost:3000
npm run build                   # apply migrations when DATABASE_URL is set
```

On Cursor hosting, `cursor-app.json` provisions Postgres; data persists across restarts.
