'use strict';
// Worker de render: recebe um directorio de trabalho (em /work/<dir>) com index.html + assets,
// corre `hyperframes render` e escreve o MP4. Contrato: POST /render -> 202 {id}; GET /render/:id.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT || 3000);
const WORK = process.env.WORK_DIR || '/work';
const DEFAULT_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS || 1800000);
const ENTRY = require.resolve('hyperframes/bin/hyperframes.mjs');
const GSAP = path.join(path.dirname(require.resolve('gsap/package.json')), 'dist', 'gsap.min.js');
const SAFE = /^[A-Za-z0-9._-]+$/;
const HF3D = process.env.HF3D_DIR || '/app/hf3d';                       // kit 3D (hf3d.mjs + fontes) da imagem
const W3D = Number(process.env.RENDER_3D_WORKERS || 2);                 // workers do Chromium para 3D (SwiftShader e caro)
const MAX3D = Number(process.env.RENDER_3D_MAX_ACTIVE || 1);            // renders 3D em simultaneo neste worker
let active3d = 0;

const jobs = new Map(); // estado efemero; o gateway persiste e reconcilia
const app = express();
app.use(express.json({ limit: '256kb' }));

function runRender(dir, out, timeoutMs, extra = []) {
  return new Promise((resolve, reject) => {
    // hyperframes junta -c/-o ao cwd: passar nomes relativos com cwd = directorio do job
    execFile(process.execPath, [ENTRY, 'render', '-c', 'index.html', '-o', out, '--quiet', ...extra], {
      cwd: dir, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, HYPERFRAMES_NO_UPDATE_CHECK: '1', HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1' },
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || stdout || err.message).split('\n').slice(-40).join('\n')));
      resolve();
    });
  });
}

app.post('/render', (req, res) => {
  const { dir, out = 'output.mp4', timeout_s, kit = false } = req.body || {};
  if (!dir || !SAFE.test(dir) || !SAFE.test(out)) return res.status(400).json({ error: 'dir/out invalidos' });
  const full = path.join(WORK, dir);
  if (!fs.existsSync(path.join(full, 'index.html'))) return res.status(400).json({ error: 'index.html em falta' });
  if (kit && active3d >= MAX3D) return res.status(429).json({ error: 'render 3D ocupado' });
  const id = crypto.randomUUID();
  const job = { status: 'running', error: null, started: Date.now(), kit: !!kit };
  jobs.set(id, job);
  fs.copyFileSync(GSAP, path.join(full, 'gsap.min.js')); // GSAP local: sem CDN, determinismo/offline
  const timeoutMs = timeout_s ? Number(timeout_s) * 1000 : DEFAULT_TIMEOUT_MS;
  const extra = [];
  if (kit) {
    // composicao 3D: kit local no directorio do job; WebGL por SwiftShader; poucos workers (memoria/CPU)
    fs.cpSync(HF3D, path.join(full, 'hf3d'), { recursive: true });
    extra.push('--workers', String(W3D), '--browser-timeout', '180', '--no-browser-gpu');
    active3d++;
  }
  runRender(full, out, timeoutMs, extra).then(() => {
    const st = fs.statSync(path.join(full, out), { throwIfNoEntry: false });
    if (!st || st.size === 0) throw new Error('render terminou sem ficheiro de saida');
    job.status = 'succeeded'; job.seconds = (Date.now() - job.started) / 1000;
  }).catch((e) => { job.status = 'failed'; job.error = e.message; })
    .finally(() => { if (kit) active3d--; });
  res.status(202).json({ id });
});

app.get('/render/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: 'desconhecido' });
  res.json(j);
});
app.get('/health', (_req, res) => res.json({ ok: true, jobs: jobs.size, active3d, kit: fs.existsSync(path.join(HF3D, 'hf3d.mjs')) }));
app.listen(PORT, () => console.log(`render-hyperframes :${PORT}`));
