// Tiny zero-dependency server: static files from www/ plus an optional local AI proxy.
// Usage: node scripts/serve.mjs [port]
//
// AI proxy (V1.5): the browser never sees your Claude API key. The key is read from the
// ANTHROPIC_API_KEY environment variable, or from a key file saved through the app
// (~/.interviewpro/anthropic.key, permissions 600, outside the repository).
// Only same-origin requests from this machine are accepted, so other websites cannot use it.
import http from 'node:http';
import https from 'node:https';
import { readFile, stat, writeFile, mkdir, unlink, chmod } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'www');
const port = Number(process.argv[2] || process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const DATA_DIR = process.env.INTERVIEWPRO_DATA || join(homedir(), '.interviewpro');
const KEY_FILE = join(DATA_DIR, 'anthropic.key');
const MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
const MAX_BODY = 64 * 1024;

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY.trim(), source: 'env' };
  try { const k = readFileSync(KEY_FILE, 'utf8').trim(); if (k) return { key: k, source: 'file' }; } catch { /* none */ }
  return { key: null, source: null };
}

const isLoopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
/** Same-origin only: a custom header forces a CORS preflight that we never approve, plus an Origin check. */
function trusted(req) {
  if (!isLoopback(req)) return false;
  if (req.headers['x-interviewpro'] !== '1') return false;
  const origin = req.headers.origin;
  if (origin) {
    try { const o = new URL(origin); if (!['localhost', '127.0.0.1'].includes(o.hostname) || o.host !== req.headers.host) return false; } catch { return false; }
  }
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

function callAnthropic(key, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const r = https.request({
      host: 'api.anthropic.com', path: '/v1/messages', method: 'POST', timeout: 30000,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-length': Buffer.byteLength(data) },
    }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => resolve({ status: resp.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    r.end(data);
  });
}

async function handleApi(req, res, p) {
  if (!trusted(req)) return json(res, 403, { error: 'forbidden' });
  if (p === '/api/ai/status' && req.method === 'GET') {
    const { key, source } = apiKey();
    return json(res, 200, { claude: !!key, source, models: MODELS });
  }
  if (p === '/api/ai/key' && req.method === 'POST') {
    const { key } = await readBody(req);
    if (typeof key !== 'string' || !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim())) return json(res, 400, { error: 'That does not look like an Anthropic API key (it starts with sk-ant-).' });
    await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    await writeFile(KEY_FILE, key.trim() + '\n', { mode: 0o600 });
    await chmod(KEY_FILE, 0o600);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/ai/key' && req.method === 'DELETE') {
    try { await unlink(KEY_FILE); } catch { /* already gone */ }
    return json(res, 200, { ok: true, claude: !!apiKey().key });
  }
  if (p === '/api/ai/messages' && req.method === 'POST') {
    const { key } = apiKey();
    if (!key) return json(res, 400, { error: 'No Claude API key configured.' });
    const b = await readBody(req);
    const payload = {
      model: MODELS.includes(b.model) ? b.model : MODELS[0],
      max_tokens: Math.min(Number(b.max_tokens) || 400, 1000),
      system: String(b.system || '').slice(0, 20000),
      messages: Array.isArray(b.messages) ? b.messages.slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 8000) })) : [],
    };
    if (b.temperature !== undefined) payload.temperature = Math.max(0, Math.min(1, Number(b.temperature)));
    try {
      const r = await callAnthropic(key, payload);
      res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(r.body);
    } catch (e) { return json(res, 502, { error: `Could not reach the Claude API: ${e.message}` }); }
  }
  return json(res, 404, { error: 'not found' });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.startsWith('/api/')) return await handleApi(req, res, p);
      if (p.endsWith('/')) p += 'index.html';
      const file = normalize(join(root, p));
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      await stat(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(await readFile(file));
    } catch (e) {
      if (!res.headersSent) { res.writeHead(e && e.message === 'too large' ? 413 : 404).end('Not found'); }
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createServer().listen(port, () => console.log(`InterviewPro running at http://localhost:${port}`));
}
