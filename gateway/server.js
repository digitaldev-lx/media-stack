'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./lib/store');
const { verify } = require('./lib/sign');
const { runMedia, deliver, callback } = require('./lib/pipeline');

if (!process.env.MEDIA_HMAC_SECRET) { console.error('MEDIA_HMAC_SECRET em falta'); process.exit(1); }
const WORK = process.env.WORK_DIR || '/work';
const MAX = Number(process.env.MAX_CONCURRENT_JOBS || 1);
const TTL_MS = Number(process.env.JOB_TTL_HOURS || 48) * 3600 * 1000;
const KINDS = new Set(['video', 'presentation', 'tts', 'music', 'sfx']);

const app = express();
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use((req, res, next) => (verify(req) ? next() : res.status(401).json({ error: 'assinatura invalida' })));

// jobs interrompidos por reinicio: falham de forma explicita (o cliente reenvia o pedido ou reconcilia com GET /v1/jobs/:id)
for (const j of store.all()) if (j.status === 'running' || j.status === 'queued') { j.status = 'failed'; j.error = { code: 'interrupted', message: 'gateway reiniciou' }; store.save(j); }

const queue = []; let active = 0;
function pump() {
  while (active < MAX && queue.length) { const id = queue.shift(); active++; execute(id).finally(() => { active--; pump(); }); }
}
async function execute(id) {
  const job = store.load(id); if (!job || job.status !== 'queued') return;
  job.status = 'running'; job.started_at = new Date().toISOString(); store.save(job);
  const step = async (s) => { job.step = s; store.save(job); };
  try {
    job.result = await runMedia(job, step);
    await deliver(job);
    job.status = 'succeeded'; job.step = 'done';
  } catch (e) {
    job.status = 'failed'; job.error = { code: 'pipeline_error', message: String(e.message || e).slice(0, 1500) };
  }
  job.finished_at = new Date().toISOString(); store.save(job);
  callback(job).catch(() => {});
}

app.post('/v1/jobs', (req, res) => {
  const b = req.body || {};
  if (!KINDS.has(b.kind)) return res.status(400).json({ error: `kind invalido; validos: ${[...KINDS]}` });
  if (!b.spec || typeof b.spec !== 'object') return res.status(400).json({ error: 'spec em falta' });
  const key = req.get('Idempotency-Key') || b.idempotency_key;
  const id = crypto.randomUUID();
  if (key && !store.idemClaim(key, id)) {
    const prev = store.idemGet(key); const j = prev && store.load(prev);
    return res.status(202).json({ id: prev, status: j ? j.status : 'queued', deduplicated: true });
  }
  const job = { id, kind: b.kind, spec: b.spec, callback_url: b.callback_url || null, idempotency_key: key || null,
    status: 'queued', step: null, result: null, error: null, created_at: new Date().toISOString() };
  store.save(job); queue.push(id); pump();
  res.status(202).json({ id, status: 'queued' });
});

app.get('/v1/jobs/:id', (req, res) => {
  const j = store.load(req.params.id); if (!j) return res.status(404).json({ error: 'nao existe' });
  const { spec, ...pub } = j; res.json(pub);
});

app.get('/v1/jobs/:id/output', (req, res) => {
  const j = store.load(req.params.id);
  if (!j || j.status !== 'succeeded') return res.status(404).json({ error: 'sem output' });
  const f = path.join(WORK, j.id, j.result.output.file);
  if (!fs.existsSync(f)) return res.status(410).json({ error: 'expirado' });
  res.type(j.result.output.content_type).sendFile(f);
});

// limpeza por TTL (disco): remove /work/<id> e o estado dos jobs antigos
setInterval(() => {
  const now = Date.now();
  for (const j of store.all()) if (j.finished_at && now - Date.parse(j.finished_at) > TTL_MS) fs.rmSync(path.join(WORK, j.id), { recursive: true, force: true });
}, 3600 * 1000).unref();

app.listen(8080, () => console.log('media-gateway :8080'));
