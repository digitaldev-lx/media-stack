'use strict';
// Persistencia simples em ficheiros (volume /state). Escrita atomica. Nada em memoria so.
const fs = require('fs');
const path = require('path');
const STATE = process.env.STATE_DIR || '/state';
const JOBS = path.join(STATE, 'jobs'); const IDEM = path.join(STATE, 'idem');
fs.mkdirSync(JOBS, { recursive: true }); fs.mkdirSync(IDEM, { recursive: true });
const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);

function save(job) {
  const f = path.join(JOBS, `${job.id}.json`); const tmp = f + '.tmp';
  job.updated_at = new Date().toISOString();
  fs.writeFileSync(tmp, JSON.stringify(job)); fs.renameSync(tmp, f);
}
const load = (id) => { try { return JSON.parse(fs.readFileSync(path.join(JOBS, `${safe(id)}.json`), 'utf8')); } catch { return null; } };
const all = () => fs.readdirSync(JOBS).filter((f) => f.endsWith('.json')).map((f) => load(f.slice(0, -5))).filter(Boolean);
const idemGet = (k) => { try { return fs.readFileSync(path.join(IDEM, safe(k)), 'utf8'); } catch { return null; } };
// criacao exclusiva (flag wx): duas chamadas concorrentes com a mesma chave nao criam dois jobs
function idemClaim(k, id) { try { fs.writeFileSync(path.join(IDEM, safe(k)), id, { flag: 'wx' }); return true; } catch { return false; } }
module.exports = { save, load, all, idemGet, idemClaim, safe };
