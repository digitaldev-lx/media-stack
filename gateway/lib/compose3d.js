"use strict";
// Composicao 3D (kind "video3d"): um canvas WebGL (Stage do kit hf3d, presets fixos em gateway/three/presets.js)
// + camada HTML por cima (titulos, legendas por palavra, selo IA). O cliente so escolhe presets e textos.
const fs = require("fs");
const path = require("path");
const { FORMATS } = require("./compose");

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const r2 = (n) => Math.round(n * 100) / 100;
const PRESETS = new Set([
  "particles-text",
  "glass-stack",
  "orbit-cards",
  "neon-logo",
]);
const TRANSITIONS = new Set([
  "fade",
  "glitch",
  "zoom",
  "iris",
  "warp",
  "whip",
  "flash",
  "ripple",
  "pixel",
  "burn",
  "swirl",
  "slices",
]);
const AUTO = [
  "warp",
  "iris",
  "glitch",
  "zoom",
  "whip",
  "ripple",
  "swirl",
  "burn",
  "slices",
];
const PRESETS_JS = path.join(__dirname, "..", "three", "presets.js");

// Valida e normaliza o pedido (antes de gastar voz): devolve {scenes, transitions} ou lanca erro legivel.
function validate(spec, limits) {
  const scenes = Array.isArray(spec.scenes) ? spec.scenes : [];
  if (!scenes.length) throw new Error("spec.scenes vazio");
  if (scenes.length > limits.maxScenes)
    throw new Error(`video3d: maximo ${limits.maxScenes} cenas`);
  const clean = (s, n) => (s == null ? null : String(s).slice(0, n));
  const out = scenes.map((s, i) => {
    const preset =
      s.preset ||
      (i === scenes.length - 1
        ? "neon-logo"
        : i === 0
          ? "particles-text"
          : "glass-stack");
    if (!PRESETS.has(preset))
      throw new Error(
        `video3d: preset invalido "${preset}"; validos: ${[...PRESETS]}`,
      );
    return {
      preset,
      text: clean(s.text, 24),
      subtitle: clean(s.subtitle, 48),
      title: clean(s.title, 80),
      color: /^#[0-9a-f]{6}$/i.test(s.color || "") ? s.color : null,
      layers: Array.isArray(s.layers)
        ? s.layers.slice(0, 6).map((x) => String(x).slice(0, 28))
        : null,
      narration: clean(s.narration, 600),
      duration: Number(s.duration) || null,
    };
  });
  const tr = Array.isArray(spec.transitions) ? spec.transitions : [];
  const transitions = out.slice(1).map((_, i) => {
    const t = tr[i] || AUTO[i % AUTO.length];
    if (!TRANSITIONS.has(t))
      throw new Error(`video3d: transicao invalida "${t}"`);
    return t;
  });
  return { scenes: out, transitions };
}

// scenes: [{start,duration,preset,...,chunks}] ; devolve {html, W, H}
function build({
  scenes,
  transitions,
  format = "horizontal",
  audio,
  badge,
  total,
  beat = 0.5,
}) {
  const [W, H] = FORMATS[format] || FORMATS.horizontal;
  const k = W / 1080;
  const spec3d = {
    width: W,
    height: H,
    total,
    beat,
    scenes: scenes.map((s) => ({
      preset: s.preset,
      start: s.start,
      end: r2(s.start + s.duration),
      text: s.text,
      subtitle: s.subtitle,
      layers: s.layers,
      color: s.color,
    })),
    transitions: transitions.map((type, i) => ({
      from: i,
      at: scenes[i + 1].start,
      type,
      d: type === "flash" ? 0.5 : 0.8,
    })),
  };
  const dom = [];
  const tl = [];
  scenes.forEach((s, i) => {
    const st = r2(s.start),
      du = r2(s.duration);
    if (s.title) {
      dom.push(
        `<div class="clip ttl" data-start="${st}" data-duration="${du}"><h1 id="t-${i}">${esc(s.title)}</h1></div>`,
      );
      tl.push(
        `tl.fromTo("#t-${i}",{opacity:0,y:-30},{opacity:1,y:0,duration:.6,ease:"power2.out"},${r2(st + 0.3)});`,
      );
    }
    (s.chunks || []).forEach((c, j) => {
      const cs = r2(c.start),
        cd = r2(Math.max(0.3, c.end - c.start));
      dom.push(
        `<div class="clip cap" data-start="${cs}" data-duration="${cd}"><div id="c-${i}-${j}">${esc(c.text)}</div></div>`,
      );
      tl.push(
        `tl.fromTo("#c-${i}-${j}",{opacity:0,y:20},{opacity:1,y:0,duration:.2,ease:"power2.out"},${cs});`,
      );
    });
  });
  const au = audio
    ? `<audio id="mix" src="${esc(audio)}" data-start="0" data-duration="${total}" data-volume="1"></audio>`
    : "";
  const bd = badge
    ? `<div class="clip" data-start="0" data-duration="${total}" style="z-index:50"><div class="badge">${esc(badge)}</div></div>`
    : "";
  const css = `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}
@font-face{font-family:"Inter";font-weight:900;src:url(hf3d/fonts/inter-900.woff2) format("woff2")}
@font-face{font-family:"Inter";font-weight:800;src:url(hf3d/fonts/inter-800.woff2) format("woff2")}
#root{position:relative;width:${W}px;height:${H}px;font-family:Inter,"Liberation Sans",sans-serif;color:#f5f5f7}
#gl{position:absolute;inset:0;width:${W}px;height:${H}px;display:block}
.clip{position:absolute;inset:0;width:${W}px;height:${H}px;pointer-events:none}
.ttl{display:flex;justify-content:center;padding-top:${90 * k}px}
.ttl h1{font-size:${64 * k}px;font-weight:900;letter-spacing:-.02em;text-shadow:0 0 ${30 * k}px rgba(124,92,255,.6)}
.cap{display:flex;align-items:flex-end;justify-content:center;padding:0 ${72 * k}px ${70 * k}px}
.cap div{font-size:${44 * k}px;font-weight:800;padding:${12 * k}px ${26 * k}px;border-radius:${14 * k}px;background:rgba(5,5,10,.72)}
.badge{position:absolute;top:${40 * k}px;right:${40 * k}px;font-size:${24 * k}px;padding:${8 * k}px ${18 * k}px;border-radius:999px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.35)}`;
  const html = `<!doctype html><html lang="pt"><head><meta charset="UTF-8"/><meta name="viewport" content="width=${W}, height=${H}"/>
<script src="gsap.min.js"></script><style>${css}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}" data-fps="30">
<canvas id="gl" width="${W}" height="${H}"></canvas>
${dom.join("\n")}
${bd}
${au}
</div>
<script>window.SPEC3D=${JSON.stringify(spec3d).replace(/</g, "\\u003c")};
window.__hf=window.__hf||{};window.__hf.buildReady=window.__hf.buildReady||{};
window.__hf.buildReady["hf3d"]=new Promise(function(r){window.__hf3dReady=r;});
window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
${tl.join("\n")}
tl.to({},{duration:${total}},0);
window.__timelines["main"]=tl;</script>
<script type="module" src="presets.js"></script></body></html>`;
  return { html, W, H };
}

function writePresets(dir) {
  fs.copyFileSync(PRESETS_JS, path.join(dir, "presets.js"));
}
module.exports = { build, validate, writePresets, PRESETS, TRANSITIONS };
