// Template: 3 cenas 3D num so Stage do kit hf3d (gancho de particulas, stack de vidro e neon, fecho em agua).
// Tudo e funcao de t (tempo da timeline). Acrescentar cenas = nova funcao + entrada em CAMK + nome no script.json.
import * as K from "./assets/hf3d.mjs";
const { THREE } = K;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

const TL = window.TL,
  WORDS = window.WORDS,
  TR = window.TR,
  BRAND = window.BRAND;
const SC = {};
TL.scenes.forEach((s) => (SC[s.name] = s));
const LS = {};
TL.scenes.forEach((s) => s.lines.forEach((l) => (LS[l.i] = l)));
const S = (n) => SC[n].start,
  E = (n) => SC[n].end,
  ln = (i) => LS[i].start;
const P = K.prog,
  eo = K.easeOutCubic,
  eb = K.easeOutBack,
  eio = K.easeInOutCubic;
const pulse = (t) => K.beatPulse(t, TL.beat0, TL.beat, 6);
const INTER = "assets/fonts/inter-900.woff",
  INTER8 = "assets/fonts/inter-800.woff";
const COL = {
  violet: 0x7c5cff,
  pink: 0xff3d81,
  amber: 0xffb020,
  lime: 0xc6ff3d,
  cyan: 0x22d3ee,
};
const ready = [];
const txt = (s, o) => {
  const t = K.text3d(s, o);
  ready.push(t.ready);
  return t.mesh;
};
function base(bg, fog = 0.02) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  if (fog) scene.fog = new THREE.FogExp2(bg, fog);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 600);
  scene.add(new THREE.HemisphereLight(0x8899ff, 0x080810, 0.6));
  const l = new THREE.PointLight(COL.violet, 60, 30);
  l.position.set(-5, 6, 4);
  scene.add(l);
  return { scene, camera };
}
function neonRect(w, h, color, intensity = 5) {
  const pts = [],
    r = 0.15,
    hw = w / 2,
    hh = h / 2;
  [
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, Math.PI / 2],
    [-hw + r, -hh + r, Math.PI],
    [hw - r, -hh + r, Math.PI * 1.5],
  ].forEach(([cx, cy, a0]) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push(V3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
  });
  return K.neonTube(pts, {
    color,
    intensity,
    radius: 0.03,
    closed: true,
    glass: false,
    segments: 200,
  });
}

function hook() {
  const { scene, camera } = base(0x020206);
  scene.add(K.mirrorFloor({ size: 80, strength: 0.7, blur: 3 }));
  const morph = K.morphParticles(
    K.textPoints("</>", {
      font: '900 300px "Inter"',
      width: 900,
      height: 380,
      step: 3,
      scale: 0.011,
      max: 16000,
    }),
    { radius: 16 },
  );
  morph.position.set(4.4, 2.5, 0);
  scene.add(morph);
  const ring = K.neonTube(
    Array.from({ length: 72 }, (_, i) =>
      V3(
        Math.cos((i / 72) * 6.283) * 3.6,
        0.04,
        Math.sin((i / 72) * 6.283) * 3.6,
      ),
    ),
    { color: COL.lime, intensity: 7, radius: 0.04, closed: true, glass: false },
  );
  ring.position.set(4.4, 0, 0);
  scene.add(ring);
  const beam = K.lightBeam({
    color: COL.violet,
    height: 10,
    bottom: 3.6,
    intensity: 0.7,
  });
  beam.position.set(4.4, 10, 0);
  scene.add(beam);
  const field = K.particleField({
    count: 4000,
    spread: [60, 14, 60],
    size: 10,
    intensity: 1.4,
  });
  field.position.y = 5;
  scene.add(field);
  return {
    scene,
    camera,
    update(t) {
      morph.update(t, eio(P(t, 0.2, 2.2)));
      field.update(t);
      beam.update(t);
      ring.setIntensity(1 + pulse(t));
    },
  };
}

function stack() {
  const { scene, camera } = base(0x04040b);
  scene.add(K.mirrorFloor({ size: 80, strength: 0.75, blur: 2.5 }));
  const layers = [
    ["Layer one", 0xff2d20],
    ["Layer two", COL.cyan],
    ["Layer three", COL.amber],
    ["Layer four", 0x2496ed],
  ];
  const slabs = layers.map(([name, c]) => {
    const g = new THREE.Group();
    g.add(
      new THREE.Mesh(
        new K.RoundedBoxGeometry(4.2, 0.34, 2.8, 4, 0.12),
        K.glass({ tint: c, thickness: 1.2 }),
      ),
    );
    const rim = neonRect(4.26, 2.86, c);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.18;
    g.add(rim);
    const l = txt(name, {
      font: INTER8,
      size: 0.34,
      color: c,
      intensity: 4,
      anchorX: "left",
    });
    l.position.set(2.6, 0.05, 0.6);
    g.add(l);
    scene.add(g);
    return g;
  });
  return {
    scene,
    camera,
    update(t) {
      slabs.forEach((g, i) => {
        const k = eb(P(t, S("stack") - 0.1 + (3 - i) * 0.08, 0.8), 1.3);
        g.position.y = 0.2 + (3 - i) * (0.36 + 1.05 * k);
        g.rotation.y = -0.25 + 0.25 * k;
      });
    },
  };
}

function outro() {
  const { scene, camera } = base(0x010208, 0.01);
  const water = K.waterPlane({
    size: 300,
    color: 0x01060d,
    sunColor: 0x222233,
    distortion: 0.9,
    speed: 0.4,
  });
  scene.add(water);
  const logo = txt(BRAND.name, {
    font: INTER,
    size: 2.4,
    color: 0xffffff,
    intensity: 3.2,
  });
  logo.position.set(0, 3.1, 0);
  scene.add(logo);
  const by = txt(BRAND.by, {
    font: INTER8,
    size: 0.5,
    color: COL.violet,
    intensity: 4,
  });
  by.position.set(0, 1.0, 0);
  scene.add(by);
  const burst = K.sparkBurst({
    t0: S("outro") + 0.5,
    speed: 10,
    count: 2400,
    gravity: -1.2,
    life: 2.6,
  });
  burst.position.set(0, 3.1, -0.5);
  scene.add(burst);
  return {
    scene,
    camera,
    update(t) {
      water.update(t);
      burst.update(t);
      const k = eo(P(t, S("outro") + 0.1, 0.8));
      logo.position.z = -12 * (1 - k);
      logo.material.opacity = k;
      by.scale.setScalar(Math.max(0.001, eb(P(t, S("outro") + 0.8, 0.5))));
    },
  };
}

const CAMK = {
  hook: [
    [0, [3.6, 2.6, 14], [2.6, 2.3, 0]],
    [E("hook") + 0.5, [2.8, 2.3, 10.5], [3.0, 2.3, 0]],
  ],
  stack: [
    [S("stack") - 0.4, [-3.5, 4.6, 13], [0.8, 2.2, 0]],
    [E("stack") + 0.4, [-1, 4.4, 13.5], [1.2, 2.4, 0]],
  ],
  outro: [
    [S("outro") - 0.4, [0, 2.6, 13], [0, 2.2, 0]],
    [E("outro"), [0, 2.3, 9.6], [0, 2.0, 0]],
  ],
};
const builders = { hook, stack, outro };
const stage = new K.Stage({
  canvas: document.getElementById("gl"),
  bloom: { intensity: 1.3, threshold: 0.78 },
});
await document.fonts.load('900 300px "Inter"');
for (const s of TL.scenes) {
  const b = builders[s.name]();
  const ck = K.cameraKeys(b.camera, CAMK[s.name]);
  const up = b.update;
  b.update = (t) => {
    up(t);
    ck.at(t);
  };
  stage.add(s.name, b);
}
const names = TL.scenes.map((s) => s.name);
function render(t) {
  window.__dom && window.__dom(t);
  for (let i = 0; i < TR.length; i++) {
    const tr = TR[i],
      a = tr.at - tr.d / 2;
    if (t >= a && t < a + tr.d) {
      const m = (t - a) / tr.d;
      stage.render(t, names[i], names[i + 1], m, tr.type, {
        chroma: 0.001 + Math.sin(m * Math.PI) * 0.006,
      });
      return;
    }
  }
  let si = 0;
  for (let i = 0; i < TL.scenes.length; i++)
    if (t >= TL.scenes[i].start) si = i;
  stage.render(t, names[si]);
}
await Promise.all(ready);
stage.warm();
K.bindTimeline(window.__timelines["main"], TL.total, render);
render(0);
window.__hf3dReady();
