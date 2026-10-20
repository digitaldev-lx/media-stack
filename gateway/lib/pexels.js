'use strict';
// Fetcher Pexels (Photos + Videos). Licenca Pexels: uso comercial permitido, atribuicao nao obrigatoria (guardada no manifest).
// A chave vem de PEXELS_API_KEY (nome); nunca e registada em logs. BLOCK de proveniencia aplicado aos metadados.
const policy = require('./policy');
const KEY = () => process.env.PEXELS_API_KEY;
const hdr = () => ({ Authorization: KEY(), 'user-agent': 'media-gateway/1.0' });

async function api(p) {
  if (!KEY()) throw new Error('PEXELS_API_KEY nao definida');
  const r = await fetch(`https://api.pexels.com${p}`, { headers: hdr(), signal: AbortSignal.timeout(20000) });
  if (r.status === 429) throw new Error('Pexels: limite de pedidos (429)');
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  return r.json();
}
const blocked = (...t) => policy.BLOCK.test(t.filter(Boolean).join(' '));

// stock: {query, type:"photo"|"video", orientation:"portrait"|"landscape"|"square", min_duration?}
async function pick(stock, format) {
  const orientation = stock.orientation || (format === 'horizontal' ? 'landscape' : format === 'square' ? 'square' : 'portrait');
  const q = encodeURIComponent(stock.query);
  if ((stock.type || 'photo') === 'photo') {
    const j = await api(`/v1/search?query=${q}&orientation=${orientation}&per_page=15&size=large`);
    const p = (j.photos || []).find((x) => !blocked(x.alt, x.url, x.photographer));
    if (!p) throw new Error(`Pexels: sem fotos aceitaveis para "${stock.query}"`);
    return { kind: 'photo', url: p.src.large2x || p.src.large, attribution: { source: 'pexels', id: p.id, page: p.url, creator: p.photographer, creator_url: p.photographer_url, license: 'Pexels License' } };
  }
  const j = await api(`/videos/search?query=${q}&orientation=${orientation}&per_page=15&size=medium`);
  const v = (j.videos || []).find((x) => !blocked(x.url, x.user && x.user.name) && x.duration >= (stock.min_duration || 2));
  if (!v) throw new Error(`Pexels: sem videos aceitaveis para "${stock.query}"`);
  const target = orientation === 'landscape' ? 1920 : 1080;
  const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.width && f.height)
    .sort((a, b) => Math.abs(Math.max(a.width, a.height) - target * (orientation === 'landscape' ? 1 : 1.78)) - Math.abs(Math.max(b.width, b.height) - target * (orientation === 'landscape' ? 1 : 1.78)));
  const f = files.find((x) => Math.max(x.width, x.height) <= 2200) || files[0];
  if (!f) throw new Error('Pexels: video sem ficheiro mp4');
  return { kind: 'video', url: f.link, duration: v.duration, attribution: { source: 'pexels', id: v.id, page: v.url, creator: v.user && v.user.name, creator_url: v.user && v.user.url, license: 'Pexels License' } };
}
module.exports = { pick };
