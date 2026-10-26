import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import api from './routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = join(__dirname, '..', '..', 'client', 'dist');
const PORT = Number(process.env.PORT || 8899);

const app = new Hono();

app.route('/api', api);

app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }));

// ---- 静态资源（生产模式：托管 client/dist，SPA 回退到 index.html）----
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

function serveStatic(path: string): Response | null {
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
  let file = join(CLIENT_DIST, safe);
  if (!file.startsWith(CLIENT_DIST)) return null;
  try {
    const st = statSync(file);
    if (st.isDirectory()) file = join(file, 'index.html');
  } catch {
    return null;
  }
  if (!existsSync(file)) return null;
  const body = readFileSync(file);
  const type = MIME[extname(file)] ?? 'application/octet-stream';
  return new Response(body, {
    headers: { 'content-type': type, 'cache-control': file.includes(`${extname(file)}`) && extname(file) !== '.html' ? 'public, max-age=86400' : 'no-cache' },
  });
}

app.get('*', (c) => {
  const staticRes = serveStatic(c.req.path);
  if (staticRes) return staticRes;
  const index = serveStatic('/index.html');
  if (index) return index;
  return c.text('客户端尚未构建：请先运行 npm run build', 503);
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`\n⚡ COMBAT STRIKE 服务已启动`);
  console.log(`   游戏入口  → http://localhost:${info.port}`);
  console.log(`   API 健康  → http://localhost:${info.port}/api/health\n`);
});
