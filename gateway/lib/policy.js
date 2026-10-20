'use strict';
// Gates de licenca/proveniencia (substitui a verificacao que hoje e humana). Reimplementado de raiz (sem codigo OpenMontage).
const fs = require('fs');
const path = require('path');
const LIB = process.env.LIBRARY_DIR || '/library';
const ALLOWED_HOSTS = (process.env.ASSET_ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
// Termos que nunca podem aparecer no URL/nome/titulo (proveniencia sensivel: arquivos judiciais, figuras politicas)
const BLOCK = /(efta0|beach-house|epstein|white[ _-]?house|biden|trump|obama)/i;

function manifest() {
  try { return JSON.parse(fs.readFileSync(path.join(LIB, 'manifest.json'), 'utf8')); } catch { return null; }
}
function checkUrl(u, title = '') {
  let url;
  try { url = new URL(u); } catch { throw new Error(`URL invalido: ${u}`); }
  if (url.protocol !== 'https:') throw new Error('so https');
  if (!ALLOWED_HOSTS.includes(url.hostname)) throw new Error(`host nao autorizado (ASSET_ALLOWED_HOSTS): ${url.hostname}`);
  if (BLOCK.test(decodeURIComponent(u) + ' ' + title)) throw new Error('bloqueado por proveniencia (BLOCK)');
  return url;
}
// "library:<ficheiro>" -> so se o manifest o declarar com commercial_ok === true
function resolveLibrary(ref) {
  const rel = ref.replace(/^library:/, '');
  const full = path.resolve(LIB, rel);
  if (!full.startsWith(path.resolve(LIB) + path.sep)) throw new Error('caminho fora da biblioteca');
  if (BLOCK.test(rel)) throw new Error('bloqueado por proveniencia (BLOCK)');
  const m = manifest();
  const entry = m && (Array.isArray(m.items) ? m.items : Object.values(m)).find((i) => i && (i.file === rel || i.path === rel));
  if (!entry || entry.commercial_ok !== true) throw new Error(`"${rel}" sem commercial_ok:true no manifest.json (licenca nao verificada)`);
  if (!fs.existsSync(full)) throw new Error('ficheiro em falta na biblioteca');
  return { full, credit: entry.credit || null };
}
module.exports = { checkUrl, resolveLibrary, BLOCK };
