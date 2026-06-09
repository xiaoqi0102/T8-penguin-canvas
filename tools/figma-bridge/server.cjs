#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const HOST = process.env.T8_FIGMA_BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.T8_FIGMA_BRIDGE_PORT || process.env.FIGMA_BRIDGE_PORT || 3845);
const BRIDGE_VERSION = 2;
const PUBLIC_BASE = `http://localhost:${PORT}`;
const MAX_BODY_BYTES = Number(process.env.T8_FIGMA_BRIDGE_MAX_BODY || 20 * 1024 * 1024);
const JOB_TTL_MS = 30 * 60 * 1000;
const CLAIM_TIMEOUT_MS = 3 * 60 * 1000;

const jobs = new Map();

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function text(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function safeString(value, fallback = '', limit = 4000) {
  return String(value || fallback).trim().slice(0, limit);
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isLocalHttpUrl(raw) {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return (u.protocol === 'http:' || u.protocol === 'https:') && (
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '::1'
    );
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function contentTypeForName(name) {
  const ext = path.extname(name || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  return 'application/octet-stream';
}

function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
      continue;
    }
    if (job.status === 'claimed' && now - (job.claimedAt || 0) > CLAIM_TIMEOUT_MS) {
      job.status = 'queued';
      job.claimedAt = 0;
      job.message = 'claim timed out; queued again';
    }
  }
}

function normalizeMaterial(raw, index) {
  const id = safeString(raw && raw.id, `item_${index + 1}`, 120) || `item_${index + 1}`;
  const kind = safeString(raw && raw.kind, '', 30).toLowerCase();
  const textValue = typeof (raw && raw.text) === 'string' ? raw.text.slice(0, 200000) : '';
  const url = safeString(raw && raw.url, '', 4000);
  const filePath = safeString(raw && raw.path, '', 4000);
  const name = safeString(raw && raw.name, kind === 'text' ? `文本 ${index + 1}` : `素材 ${index + 1}`, 240);
  if (kind === 'text') {
    if (!textValue.trim()) return null;
  } else if (!url && !filePath) {
    return null;
  }
  return {
    id,
    kind: ['image', 'video', 'audio', 'text'].includes(kind) ? kind : 'file',
    name,
    url,
    path: filePath,
    text: kind === 'text' ? textValue : '',
  };
}

function publicJob(job) {
  return {
    id: job.id,
    app: job.app,
    tags: job.tags,
    createdAt: job.createdAt,
    status: job.status,
    materials: job.materials.map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      text: item.kind === 'text' ? item.text : undefined,
      sourceUrl: item.url || undefined,
      assetUrl: item.kind === 'text' ? undefined : `${PUBLIC_BASE}/asset/${encodeURIComponent(job.id)}/${encodeURIComponent(item.id)}`,
    })),
  };
}

function queueJob(payload) {
  cleanupJobs();
  const materials = (Array.isArray(payload.materials) ? payload.materials : [])
    .map(normalizeMaterial)
    .filter(Boolean);
  if (materials.length === 0) {
    throw new Error('No materials to import');
  }
  const job = {
    id: newId(),
    app: safeString(payload.app, 't8-penguin-canvas', 120),
    tags: Array.isArray(payload.tags) ? payload.tags.map((tag) => safeString(tag, '', 60)).filter(Boolean).slice(0, 20) : [],
    createdAt: Date.now(),
    claimedAt: 0,
    completedAt: 0,
    status: 'queued',
    message: '',
    materials,
  };
  jobs.set(job.id, job);
  return job;
}

function claimNextJob() {
  cleanupJobs();
  const job = Array.from(jobs.values())
    .sort((a, b) => a.createdAt - b.createdAt)
    .find((item) => item.status === 'queued');
  if (!job) return null;
  job.status = 'claimed';
  job.claimedAt = Date.now();
  return publicJob(job);
}

function completeJob(jobId, ok, message) {
  cleanupJobs();
  const job = jobs.get(String(jobId || ''));
  if (!job) return false;
  job.status = ok ? 'completed' : 'failed';
  job.completedAt = Date.now();
  job.message = safeString(message, '', 1000);
  return true;
}

async function streamAsset(req, res, pathname) {
  cleanupJobs();
  const parts = pathname.split('/').filter(Boolean);
  const jobId = decodeURIComponent(parts[1] || '');
  const itemId = decodeURIComponent(parts[2] || '');
  const job = jobs.get(jobId);
  const item = job && job.materials.find((x) => x.id === itemId);
  if (!job || !item || item.kind === 'text') return text(res, 404, 'Asset not found');

  if (item.path) {
    const resolved = path.resolve(item.path);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      res.writeHead(200, {
        'Content-Type': contentTypeForName(resolved),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(resolved).pipe(res);
      return;
    }
  }

  if (item.url && isLocalHttpUrl(item.url)) {
    const upstream = await fetch(item.url);
    if (!upstream.ok) return text(res, upstream.status, `Asset fetch failed: ${upstream.status}`);
    const contentType = upstream.headers.get('content-type') || contentTypeForName(item.name || item.url);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    const arrayBuffer = await upstream.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
    return;
  }

  return text(res, 404, 'Asset path is not available');
}

async function handle(req, res) {
  const parsed = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && (pathname === '/' || pathname === '/health' || pathname === '/api/health')) {
      cleanupJobs();
      const all = Array.from(jobs.values());
      return json(res, 200, {
        success: true,
        service: 't8-figma-bridge',
        version: BRIDGE_VERSION,
        host: HOST,
        port: PORT,
        assetBase: PUBLIC_BASE,
        queued: all.filter((job) => job.status === 'queued').length,
        claimed: all.filter((job) => job.status === 'claimed').length,
        completed: all.filter((job) => job.status === 'completed').length,
      });
    }

    if (req.method === 'POST' && (pathname === '/import' || pathname === '/api/import')) {
      const payload = await readBody(req);
      const job = queueJob(payload);
      return json(res, 200, {
        success: true,
        data: {
          jobId: job.id,
          queued: true,
          materials: job.materials.length,
          message: 'Queued for the Figma plugin. Run T8 Penguin Canvas Bridge in Figma to import it.',
        },
      });
    }

    if (req.method === 'GET' && (pathname === '/jobs' || pathname === '/api/jobs')) {
      cleanupJobs();
      return json(res, 200, {
        success: true,
        data: Array.from(jobs.values()).map((job) => ({
          id: job.id,
          createdAt: job.createdAt,
          status: job.status,
          materials: job.materials.length,
          message: job.message || '',
        })),
      });
    }

    if (req.method === 'POST' && (pathname === '/claim' || pathname === '/api/claim')) {
      const job = claimNextJob();
      return json(res, 200, {
        success: true,
        data: job,
      });
    }

    if (req.method === 'POST' && (pathname === '/complete' || pathname === '/api/complete')) {
      const payload = await readBody(req);
      const ok = completeJob(payload.jobId, payload.ok !== false, payload.message || '');
      return json(res, ok ? 200 : 404, {
        success: ok,
        error: ok ? undefined : 'Job not found',
      });
    }

    if (req.method === 'GET' && pathname.startsWith('/asset/')) {
      return streamAsset(req, res, pathname);
    }

    return json(res, 404, { success: false, error: 'Not found' });
  } catch (e) {
    return json(res, 500, { success: false, error: e && e.message ? e.message : String(e) });
  }
}

const server = http.createServer(handle);
async function probeExistingBridge() {
  const bases = [
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    `http://[::1]:${PORT}`,
  ];
  for (const base of bases) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const resp = await fetch(`${base}/health`, { signal: controller.signal });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data && data.service === 't8-figma-bridge') {
        if (Number(data.version || 0) >= BRIDGE_VERSION && data.assetBase === PUBLIC_BASE) {
          return { ok: true, base, data };
        }
        return { ok: false, outdated: true, base, data };
      }
    } catch {
      // Try the next local alias.
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false };
}

function logOutdatedBridge(existing) {
  const base = existing && existing.base ? existing.base : `localhost:${PORT}`;
  const version = existing && existing.data && existing.data.version ? existing.data.version : 'unknown';
  console.error(`[t8-figma-bridge] found an older bridge at ${base} (version ${version}).`);
  console.error('[t8-figma-bridge] Close the old bridge window or stop the old node.exe process, then start this bridge again.');
}

function holdExistingBridge(existing) {
  console.log('[t8-figma-bridge] This is a status window for the existing bridge.');
  console.log('[t8-figma-bridge] You can keep it open while using Figma; closing this duplicate window will not stop the original bridge.');
  setInterval(async () => {
    const latest = await probeExistingBridge();
    if (!latest.ok) {
      console.error('[t8-figma-bridge] Existing bridge is no longer healthy. Restart this script if Figma cannot import.');
      process.exit(1);
      return;
    }
  }, 5000).unref();
  setInterval(() => {}, 60 * 60 * 1000);
}

server.on('error', async (error) => {
  if (error && error.code === 'EADDRINUSE') {
    const existing = await probeExistingBridge();
    if (existing.outdated) {
      logOutdatedBridge(existing);
      process.exit(2);
      return;
    }
    if (existing.ok) {
      console.log(`[t8-figma-bridge] already running at ${existing.base}`);
      console.log('[t8-figma-bridge] Run the Figma plugin. If this is a duplicate window, it is safe to close.');
      if (process.env.T8_FIGMA_BRIDGE_KEEP_ALIVE_ON_EXISTING === '1') holdExistingBridge(existing);
      else process.exit(0);
      return;
    }
    console.error(`[t8-figma-bridge] port ${PORT} is already in use by another program.`);
    console.error('[t8-figma-bridge] Close the other program or set T8_FIGMA_BRIDGE_PORT to another port.');
    process.exit(1);
    return;
  }
  console.error('[t8-figma-bridge] failed to start:', error && error.message ? error.message : error);
  process.exit(1);
});

async function start() {
  const existing = await probeExistingBridge();
  if (existing.outdated) {
    logOutdatedBridge(existing);
    process.exit(2);
    return;
  }
  if (existing.ok) {
    console.log(`[t8-figma-bridge] already running at ${existing.base}`);
    console.log('[t8-figma-bridge] Run the Figma plugin. If this is a duplicate window, it is safe to close.');
    if (process.env.T8_FIGMA_BRIDGE_KEEP_ALIVE_ON_EXISTING === '1') holdExistingBridge(existing);
    return;
  }

  server.listen(PORT, HOST, () => {
    console.log(`[t8-figma-bridge] listening on http://${HOST}:${PORT}`);
    console.log('[t8-figma-bridge] Import tools/figma-bridge/plugin/manifest.json in Figma, then run the plugin.');
  });
}

start().catch((error) => {
  console.error('[t8-figma-bridge] failed to start:', error && error.message ? error.message : error);
  process.exit(1);
});
