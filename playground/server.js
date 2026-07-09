/**
 * Faqir UI Dev Server — Bun HTTP on port 5555
 * JSON-file-backed CRUD API + static file serving for the playground.
 *
 * Run:  bun playground/server.js
 * API:  GET/POST /api/tasks, GET/PATCH/DELETE /api/tasks/:id
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';

const PORT = 5555;
const DB_PATH = join(import.meta.dir, 'db.json');
const ROOT = join(import.meta.dir, '..');

// ── Database helpers ────────────────────────────────────────

function readDb() {
  return JSON.parse(readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ── MIME types for static serving ───────────────────────────

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

// ── Request handler ─────────────────────────────────────────

function cors(headers = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: cors({ 'Content-Type': 'application/json' }),
  });
}

Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    // ── API routes ────────────────────────────────────────

    // GET /api/tasks — list all
    if (pathname === '/api/tasks' && method === 'GET') {
      const db = readDb();
      return json(db.tasks);
    }

    // POST /api/tasks — create
    if (pathname === '/api/tasks' && method === 'POST') {
      const db = readDb();
      const body = await req.json();
      const task = { id: db.nextId++, ...body };
      db.tasks.push(task);
      writeDb(db);
      return json(task, 201);
    }

    // GET /api/tasks/:id
    const single = pathname.match(/^\/api\/tasks\/(\d+)$/);
    if (single) {
      const id = Number(single[1]);
      const db = readDb();
      const task = db.tasks.find(t => t.id === id);
      if (!task) return json({ error: 'Not found' }, 404);

      // GET
      if (method === 'GET') {
        return json(task);
      }

      // PATCH /api/tasks/:id — update
      if (method === 'PATCH') {
        const body = await req.json();
        Object.assign(task, body);
        writeDb(db);
        return json(task);
      }

      // DELETE /api/tasks/:id
      if (method === 'DELETE') {
        db.tasks = db.tasks.filter(t => t.id !== id);
        writeDb(db);
        return json({ ok: true });
      }
    }

    // ── Static file serving ───────────────────────────────

    let filePath = join(ROOT, pathname === '/' ? 'playground/index.html' : pathname);

    // Serve playground files at root (e.g. /task-manager.html → playground/task-manager.html)
    if (!existsSync(filePath)) {
      filePath = join(ROOT, 'playground', pathname);
    }

    try {
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const ext = extname(filePath);
        const mime = MIME[ext] || 'application/octet-stream';
        const content = readFileSync(filePath);
        return new Response(content, {
          headers: cors({ 'Content-Type': mime }),
        });
      }
    } catch {
      // fall through to 404
    }

    return json({ error: 'Not found' }, 404);
  },
});

console.log(`\n  Faqir UI Dev Server running at http://localhost:${PORT}`);
console.log(`  Task Manager:  http://localhost:${PORT}/task-manager.html`);
console.log(`  API endpoint:  http://localhost:${PORT}/api/tasks\n`);
