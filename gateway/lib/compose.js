'use strict';
// Constroi a composicao HyperFrames (HTML + timeline GSAP) para video e apresentacoes.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = (n) => Math.round(n * 100) / 100;
const FORMATS = { vertical: [1080, 1920], horizontal: [1920, 1080], square: [1080, 1080] };

function css(W, H, theme) {
  const t = { bg: '#0b0f14', fg: '#f4f6f8', accent: '#3ddc97', ...(theme || {}) };
  const k = W / 1080;
  return `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden;background:${t.bg}}
#root{position:relative;width:${W}px;height:${H}px;font-family:Inter,"Liberation Sans",sans-serif;color:${t.fg}}
.clip{position:absolute;inset:0;width:${W}px;height:${H}px}
.bg{object-fit:cover;transform-origin:50% 50%}
.grad{background:radial-gradient(120% 90% at 20% 10%, ${t.accent}33 0%, transparent 55%), linear-gradient(160deg, #101722 0%, ${t.bg} 100%)}
.shade{background:linear-gradient(to top, rgba(0,0,0,.65) 0%, rgba(0,0,0,0) 40%)}
.cap{display:flex;align-items:flex-end;justify-content:center;padding:0 ${72 * k}px ${150 * k}px}
.cap div{font-size:${56 * k}px;font-weight:600;line-height:1.25;text-align:center;text-shadow:0 4px 24px rgba(0,0,0,.65)}
.slide{display:flex;flex-direction:column;justify-content:center;padding:${96 * k}px ${110 * k}px}
.slide h1{font-size:${72 * k}px;font-weight:800;line-height:1.1;margin-bottom:${48 * k}px;border-left:${10 * k}px solid ${t.accent};padding-left:${32 * k}px}
.slide li{list-style:none;font-size:${44 * k}px;line-height:1.35;margin:${18 * k}px 0;padding-left:${44 * k}px;position:relative}
.slide li::before{content:"";position:absolute;left:0;top:${0.55 * 44 * k}px;width:${16 * k}px;height:${16 * k}px;border-radius:50%;background:${t.accent}}
.badge{position:absolute;top:${48 * k}px;right:${48 * k}px;font-size:${26 * k}px;padding:${8 * k}px ${18 * k}px;border-radius:999px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.35);z-index:50}`;
}

// scenes: [{start,duration,layout,title,bullets,caption,image,words}] ; devolve {html,total}
function build({ scenes, format = 'vertical', theme, audio, badge, total }) {
  const [W, H] = FORMATS[format] || FORMATS.vertical;
  const blocks = []; const tl = [];
  scenes.forEach((s, i) => {
    const st = r2(s.start); const du = r2(s.duration); const end = r2(st + du);
    const parts = [];
    if (s.video) parts.push(`<video id="bg-${i}" class="clip bg" data-start="${st}" data-duration="${du}" src="${esc(s.video)}" muted playsinline></video><div class="clip shade" data-start="${st}" data-duration="${du}"></div>`);
    else if (s.image) parts.push(`<img id="bg-${i}" class="clip bg" data-start="${st}" data-duration="${du}" src="${esc(s.image)}"/><div class="clip shade" data-start="${st}" data-duration="${du}"></div>`);
    else parts.push(`<div id="bg-${i}" class="clip grad" data-start="${st}" data-duration="${du}"></div>`);
    if (s.layout === 'slide') {
      const lis = (s.bullets || []).map((b, j) => `<li id="b-${i}-${j}">${esc(b)}</li>`).join('');
      parts.push(`<div class="clip slide" data-start="${st}" data-duration="${du}"><h1 id="t-${i}">${esc(s.title)}</h1><ul>${lis}</ul></div>`);
      tl.push(`tl.fromTo("#t-${i}",{opacity:0,x:-40},{opacity:1,x:0,duration:.6,ease:"power2.out"},${st});`);
      (s.bullets || []).forEach((_, j) => {
        const at = r2(st + 0.5 + (j * Math.max(0.6, (du - 1.2) / Math.max(1, s.bullets.length))));
        tl.push(`tl.fromTo("#b-${i}-${j}",{opacity:0,y:30},{opacity:1,y:0,duration:.5,ease:"power2.out"},${at});`);
      });
    } else {
      if (s.title) parts.push(`<div class="clip slide" style="justify-content:flex-start;padding-top:${200 * (W / 1080)}px" data-start="${st}" data-duration="${du}"><h1 id="t-${i}">${esc(s.title)}</h1></div>`);
      (s.chunks && s.chunks.length ? s.chunks : (s.caption ? [{ text: s.caption, start: st, end }] : [])).forEach((c, j) => {
        const cs = r2(c.start), cd = r2(Math.max(0.3, c.end - c.start));
        parts.push(`<div class="clip cap" data-start="${cs}" data-duration="${cd}"><div id="c-${i}-${j}">${esc(c.text)}</div></div>`);
        tl.push(`tl.fromTo("#c-${i}-${j}",{opacity:0,y:30},{opacity:1,y:0,duration:.25,ease:"power2.out"},${cs});`);
      });
      if (s.title) tl.push(`tl.fromTo("#t-${i}",{opacity:0,y:-30},{opacity:1,y:0,duration:.6},${st});`);
    }
    if (s.image) tl.push(`tl.fromTo("#bg-${i}",{scale:1},{scale:1.15,ease:"none",duration:${du}},${st});`);
    blocks.push(`<div class="scene" data-start="${st}" data-duration="${du}" data-track-index="0">${parts.join('')}</div>`);
  });
  const au = audio ? `<audio id="mix" class="clip" src="${esc(audio)}" data-start="0" data-duration="${total}" data-has-audio="true" data-volume="1" preload="auto"></audio>` : '';
  const bd = badge ? `<div class="clip" data-start="0" data-duration="${total}" style="z-index:50"><div class="badge">${esc(badge)}</div></div>` : '';
  const html = `<!doctype html><html lang="pt"><head><meta charset="UTF-8"/><meta name="viewport" content="width=${W}, height=${H}"/>
<script src="gsap.min.js"></script><style>${css(W, H, theme)}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}" data-fps="30">
${blocks.join('\n')}
${bd}
${au}
</div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
${tl.join('\n')}
window.__timelines["main"]=tl;tl.seek(0);</script></body></html>`;
  return { html, W, H };
}
module.exports = { build, FORMATS };
