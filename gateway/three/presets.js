// Presets 3D do kind "video3d" (corre no Chromium do render-hyperframes, com hf3d/hf3d.mjs local).
// O cliente da API NAO envia JavaScript: so escolhe presets e textos; este ficheiro e fixo e vem do gateway.
// Determinismo: tudo e funcao do tempo da timeline (sem rAF, sem relogio, sem Math.random).
import * as K from "./hf3d/hf3d.mjs";
const { THREE } = K;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const SPEC = window.SPEC3D;
const W = SPEC.width,
  H = SPEC.height,
  ASPECT = W / H,
  PORTRAIT = H > W;
const P = K.prog,
  eo = K.easeOutCubic,
  eb = K.easeOutBack,
  eio = K.easeInOutCubic;
const pulse = (t) => K.beatPulse(t, 0, SPEC.beat || 0.5, 6);
const FONT = "hf3d/fonts/inter-900.woff",
  FONT8 = "hf3d/fonts/inter-800.woff";
const PAL = [0x7c5cff, 0xff3d81, 0xffb020, 0xc6ff3d, 0x22d3ee, 0x2496ed];
const hex = (c, d) =>
  typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)
    ? parseInt(c.slice(1), 16)
    : d;
const ready = [];
const txt = (s, o) => {
  const t = K.text3d(s, o);
  ready.push(t.ready);
  return t.mesh;
};
// enquadramento: em vertical a camara afasta-se para caber a mesma largura
const fit = (z) => (PORTRAIT ? z * 1.9 : z);

function base(bg, fog = 0.02) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  if (fog) scene.fog = new THREE.FogExp2(bg, fog);
  const camera = new THREE.PerspectiveCamera(
    PORTRAIT ? 50 : 40,
    ASPECT,
    0.1,
    600,
  );
  scene.add(new THREE.HemisphereLight(0x8899ff, 0x080810, 0.6));
  const l = new THREE.PointLight(0x7c5cff, 60, 30);
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

const PRESETS = {
  // texto feito de particulas sobre chao espelhado, anel neon e feixe de luz
  "particles-text": (s) => {
    const { scene, camera } = base(0x020206);
    scene.add(K.mirrorFloor({ size: 80, strength: 0.7, blur: 3 }));
    const tx = s.text || "</>";
    const px = Math.min(300, Math.round(2000 / Math.max(3, tx.length))); // texto longo: letra menor
    const morph = K.morphParticles(
      K.textPoints(tx, {
        font: `900 ${px}px "Inter"`,
        width: 1400,
        height: 380,
        step: 3,
        scale: 0.011 * (PORTRAIT ? 0.75 : 1),
        max: 16000,
      }),
      { radius: 16 },
    );
    morph.position.set(0, 2.5, 0);
    scene.add(morph);
    const ring = K.neonTube(
      Array.from({ length: 72 }, (_, i) =>
        V3(
          Math.cos((i / 72) * 6.283) * 3.6,
          0.04,
          Math.sin((i / 72) * 6.283) * 3.6,
        ),
      ),
      {
        color: hex(s.color, 0xc6ff3d),
        intensity: 7,
        radius: 0.04,
        closed: true,
        glass: false,
      },
    );
    scene.add(ring);
    const beam = K.lightBeam({
      color: 0x7c5cff,
      height: 10,
      bottom: 3.6,
      intensity: 0.7,
    });
    beam.position.set(0, 10, 0);
    scene.add(beam);
    const field = K.particleField({
      count: 4000,
      spread: [60, 14, 60],
      size: 10,
      intensity: 1.4,
    });
    field.position.y = 5;
    scene.add(field);
    const cam = K.cameraKeys(camera, [
      [s.start - 0.4, [0.6, 2.6, fit(14)], [0, 2.3, 0]],
      [s.end + 0.4, [-0.3, 2.4, fit(10.5)], [0, 2.3, 0]],
    ]);
    return {
      scene,
      camera,
      update(t) {
        morph.update(t, eio(P(t, s.start + 0.1, 2.2)));
        field.update(t);
        beam.update(t);
        ring.setIntensity(1 + pulse(t));
        cam.at(t);
      },
    };
  },
  // camadas de vidro com contorno neon a abrir sobre chao espelhado
  "glass-stack": (s) => {
    const { scene, camera } = base(0x04040b);
    scene.add(K.mirrorFloor({ size: 80, strength: 0.75, blur: 2.5 }));
    const layers = (s.layers && s.layers.length ? s.layers : ["Layer"]).slice(
      0,
      5,
    );
    const slabs = layers.map((name, i) => {
      const c = PAL[i % PAL.length];
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
        font: FONT8,
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
    const n = slabs.length;
    const cam = K.cameraKeys(camera, [
      [s.start - 0.4, [-3.5, 4.6, fit(13)], [0.8, 2.2, 0]],
      [s.end + 0.4, [-1, 4.4, fit(13.5)], [1.2, 2.4, 0]],
    ]);
    return {
      scene,
      camera,
      update(t) {
        slabs.forEach((g, i) => {
          const k = eb(P(t, s.start + 0.2 + (n - 1 - i) * 0.1, 0.9), 1.3);
          g.position.y = 0.2 + (n - 1 - i) * (0.36 + 1.05 * k);
          g.rotation.y = -0.25 + 0.25 * k;
        });
        cam.at(t);
      },
    };
  },
  // cartoes de vidro em orbita (ex.: 5 redes), pulso no beat
  "orbit-cards": (s) => {
    const { scene, camera } = base(0x030308, 0.018);
    scene.add(K.mirrorFloor({ size: 140, strength: 0.75, blur: 2 }));
    const items = (
      s.layers && s.layers.length ? s.layers : ["A", "B", "C"]
    ).slice(0, 6);
    const cards = items.map((name, i) => {
      const c = PAL[i % PAL.length];
      const g = new THREE.Group();
      g.add(
        new THREE.Mesh(
          new K.RoundedBoxGeometry(1.6, 2.1, 0.08, 4, 0.12),
          K.glass({ tint: c, thickness: 0.4, iridescence: 0.9 }),
        ),
      );
      const rim = neonRect(1.64, 2.14, c);
      rim.position.z = 0.05;
      g.add(rim);
      const l = txt(name, { font: FONT8, size: 0.24, color: c, intensity: 4 });
      l.position.set(0, -0.7, 0.06);
      g.add(l);
      scene.add(g);
      return g;
    });
    const burst = K.sparkBurst({ t0: s.start + 0.2, speed: 9, count: 2000 });
    burst.position.set(0, 2.4, 0);
    scene.add(burst);
    const cam = K.cameraKeys(camera, [
      [s.start - 0.3, [0, 3.2, fit(10.5)], [0, 2.4, 0]],
      [s.end + 0.4, [0, 3.4, fit(11.5)], [0, 2.4, 0]],
    ]);
    return {
      scene,
      camera,
      update(t) {
        const sp = eb(P(t, s.start + 0.3, 0.8), 1.2),
          n = cards.length;
        cards.forEach((g, i) => {
          const a = (i - (n - 1) / 2) * 0.6 + t * 0.35 * sp;
          g.position.set(
            Math.sin(a) * 4.2 * sp,
            2.4,
            (Math.cos(a) - 1) * 2.2 * sp,
          );
          g.rotation.y = a * sp * 0.6;
          g.scale.setScalar(
            Math.max(0.001, (0.4 + 0.6 * sp) * (1 + pulse(t) * 0.05)),
          );
        });
        burst.update(t);
        cam.at(t, { shake: 0.05 * pulse(t) });
      },
    };
  },
  // logo em neon reflectido em agua + subtitulo
  "neon-logo": (s) => {
    const { scene, camera } = base(0x010208, 0.01);
    const water = K.waterPlane({
      size: 300,
      color: 0x01060d,
      sunColor: 0x222233,
      distortion: 0.9,
      speed: 0.4,
    });
    scene.add(water);
    const lt = s.text || "hf3d";
    const logo = txt(lt, {
      font: FONT,
      size: Math.min(2.4, 13 / Math.max(4, lt.length)) * (PORTRAIT ? 0.8 : 1), // cabe no enquadramento
      color: hex(s.color, 0xffffff),
      intensity: 3.2,
    });
    logo.position.set(0, 3.1, 0);
    scene.add(logo);
    const sub = s.subtitle
      ? txt(s.subtitle, {
          font: FONT8,
          size: 0.5,
          color: 0x7c5cff,
          intensity: 4,
        })
      : null;
    if (sub) {
      sub.position.set(0, 1.0, 0);
      scene.add(sub);
    }
    const burst = K.sparkBurst({
      t0: s.start + 0.5,
      speed: 10,
      count: 2400,
      gravity: -1.2,
      life: 2.6,
    });
    burst.position.set(0, 3.1, -0.5);
    scene.add(burst);
    const cam = K.cameraKeys(camera, [
      [s.start - 0.4, [0, 2.6, fit(13)], [0, 2.2, 0]],
      [s.end, [0, 2.3, fit(9.6)], [0, 2.0, 0]],
    ]);
    return {
      scene,
      camera,
      update(t) {
        water.update(t);
        burst.update(t);
        const k = eo(P(t, s.start + 0.1, 0.8));
        logo.position.z = -12 * (1 - k);
        logo.material.opacity = k;
        if (sub)
          sub.scale.setScalar(Math.max(0.001, eb(P(t, s.start + 0.8, 0.5))));
        cam.at(t);
      },
    };
  },
};

const stage = new K.Stage({
  canvas: document.getElementById("gl"),
  width: W,
  height: H,
  bloom: { intensity: 1.3, threshold: 0.78 },
});
await document.fonts.load('900 300px "Inter"');
SPEC.scenes.forEach((s, i) => stage.add("s" + i, PRESETS[s.preset](s)));
function render(t) {
  for (const tr of SPEC.transitions) {
    const a = tr.at - tr.d / 2;
    if (t >= a && t < a + tr.d) {
      const m = (t - a) / tr.d;
      stage.render(t, "s" + tr.from, "s" + (tr.from + 1), m, tr.type, {
        chroma: 0.001 + Math.sin(m * Math.PI) * 0.006,
      });
      return;
    }
  }
  let si = 0;
  SPEC.scenes.forEach((s, i) => {
    if (t >= s.start) si = i;
  });
  stage.render(t, "s" + si);
}
await Promise.all(ready);
stage.warm();
K.bindTimeline(window.__timelines["main"], SPEC.total, render);
render(0);
window.__hf3dReady();
