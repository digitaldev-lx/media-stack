'use strict';
// Tecto de custo da voz fal.ai: por pedido e por dia (UTC). Estado em /state/spend.json (persistente).
const fs = require('fs');
const path = require('path');
const F = path.join(process.env.STATE_DIR || '/state', 'spend.json');
const PER_1K = Number(process.env.FAL_TTS_USD_PER_1K_CHARS || 0.10);   // CONFIRMAR no fal.ai/pricing
const MAX_JOB = Number(process.env.FAL_MAX_USD_PER_JOB || 0.5);
const MAX_DAY = Number(process.env.FAL_MAX_USD_PER_DAY || 5);
const today = () => new Date().toISOString().slice(0, 10);
const read = () => { try { const j = JSON.parse(fs.readFileSync(F, 'utf8')); return j.day === today() ? j : { day: today(), usd: 0 }; } catch { return { day: today(), usd: 0 }; } };
const cost = (chars) => (chars / 1000) * PER_1K;

// jobSpent = gasto ja feito neste pedido. Devolve {ok, reason, usd}
function check(chars, jobSpent) {
  const usd = cost(chars);
  if (jobSpent + usd > MAX_JOB) return { ok: false, reason: `tecto por pedido excedido (${(jobSpent + usd).toFixed(3)} > ${MAX_JOB} USD)`, usd };
  if (read().usd + usd > MAX_DAY) return { ok: false, reason: `tecto diario excedido (${(read().usd + usd).toFixed(3)} > ${MAX_DAY} USD)`, usd };
  return { ok: true, usd };
}
function record(usd) { const s = read(); s.usd = Math.round((s.usd + usd) * 1e5) / 1e5; fs.writeFileSync(F, JSON.stringify(s)); }
module.exports = { check, record, cost, read };
