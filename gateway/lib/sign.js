'use strict';
// Assinatura HMAC-SHA256. Texto assinado: `${ts}.${METHOD}.${pathComQuery}.${corpoBruto}`
const crypto = require('crypto');
const SECRET = process.env.MEDIA_HMAC_SECRET || '';
const WINDOW_S = 300;

function sign(ts, method, url, body) {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${ts}.${method}.${url}.${body}`).digest('hex');
}
function verify(req) {
  const ts = req.get('X-Timestamp'); const sig = req.get('X-Signature') || '';
  if (!SECRET || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > WINDOW_S) return false;
  const exp = sign(ts, req.method, req.originalUrl, req.rawBody || '');
  const a = Buffer.from(exp); const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { sign, verify };
