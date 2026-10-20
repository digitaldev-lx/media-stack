// Particulas GPU: posicao calculada NO SHADER a partir de atributos com semente + uTime.
// Nao ha simulacao com estado -> qualquer frame pode ser renderizado em qualquer ordem.
import * as THREE from "three";
import { rng } from "./core.js";
import { NOISE_GLSL } from "./noise.js";

const SPRITE_FRAG = /* glsl */ `
  varying vec3 vCol; varying float vA;
  void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p);
    float core = exp(-d * d * 40.0); float halo = exp(-d * d * 9.0) * 0.35;
    float a = (core + halo) * vA; if (a < 0.003) discard;
    gl_FragColor = vec4(vCol * a, a); }`;

function palAttr(n, colors, r, intensity) {
  const col = new Float32Array(n * 3),
    c = colors.map((x) => new THREE.Color(x).multiplyScalar(intensity));
  for (let i = 0; i < n; i++) {
    const k = c[Math.floor(r() * c.length)];
    col.set([k.r, k.g, k.b], i * 3);
  }
  return col;
}

/**
 * Campo/nuvem de particulas com deriva em ruido. mode "field" (caixa), "sphere" ou "tunnel" (voo em z).
 * update(t, {intensity, size}) .
 */
export function particleField({
  count = 6000,
  seed = 11,
  mode = "field",
  spread = [30, 16, 30],
  colors = [0x7c5cff, 0x22d3ee, 0xff3d81],
  size = 18,
  intensity = 3,
  speed = 1,
  depth = 120,
} = {}) {
  const r = rng(seed);
  const g = new THREE.BufferGeometry();
  const base = new Float32Array(count * 3),
    rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    if (mode === "sphere") {
      const u = r() * 2 - 1,
        th = r() * Math.PI * 2,
        rr = Math.cbrt(r()) * spread[0];
      const s = Math.sqrt(1 - u * u);
      base.set([Math.cos(th) * s * rr, u * rr, Math.sin(th) * s * rr], i * 3);
    } else if (mode === "tunnel") {
      const a = r() * Math.PI * 2,
        rr = spread[0] * (0.25 + r());
      base.set([Math.cos(a) * rr, Math.sin(a) * rr * 0.6, -r() * depth], i * 3);
    } else
      base.set(
        [
          (r() - 0.5) * spread[0],
          (r() - 0.5) * spread[1],
          (r() - 0.5) * spread[2],
        ],
        i * 3,
      );
    rnd.set([r(), r(), r(), r()], i * 4);
  }
  g.setAttribute("position", new THREE.BufferAttribute(base, 3));
  g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
  g.setAttribute(
    "aCol",
    new THREE.BufferAttribute(palAttr(count, colors, r, 1), 3),
  );
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: size },
      uInt: { value: intensity },
      uSpeed: { value: speed },
      uDepth: { value: depth },
      uTunnel: { value: mode === "tunnel" ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uSize, uInt, uSpeed, uDepth, uTunnel; attribute vec4 aRnd; attribute vec3 aCol;
      varying vec3 vCol; varying float vA;
      ${NOISE_GLSL}
      void main(){
        vec3 p = position; float t = uTime * uSpeed;
        p += vec3(snoise(p * 0.08 + vec3(t * 0.1, 0.0, aRnd.x * 10.0)), snoise(p * 0.08 + vec3(0.0, t * 0.1, aRnd.y * 10.0)), snoise(p * 0.08 + vec3(aRnd.z * 10.0, 0.0, t * 0.1))) * 1.6;
        if (uTunnel > 0.5) { p.z = mod(p.z + t * 20.0, uDepth) - uDepth; }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float tw = 0.6 + 0.4 * sin(uTime * (2.0 + aRnd.w * 4.0) + aRnd.x * 6.283);
        vCol = aCol * uInt * tw; vA = smoothstep(0.0, 6.0, -mv.z) * (0.5 + aRnd.z * 0.5);
        gl_PointSize = uSize * (0.4 + aRnd.w) * (10.0 / -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: SPRITE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.update = (t, o = {}) => {
    mat.uniforms.uTime.value = t;
    if (o.intensity != null) mat.uniforms.uInt.value = o.intensity;
    if (o.size != null) mat.uniforms.uSize.value = o.size;
  };
  return pts;
}

/**
 * Particulas a correr ao longo de uma curva (filas como luz num tubo).
 * A curva e amostrada para uma DataTexture; cada particula tem fase + offset radial.
 */
export function curveFlow(
  curve,
  {
    count = 3000,
    seed = 5,
    radius = 0.25,
    colors = [0xffffff],
    size = 22,
    intensity = 4,
    speed = 0.15,
    samples = 512,
  } = {},
) {
  const r = rng(seed);
  const tex = new Float32Array(samples * 4);
  for (let i = 0; i < samples; i++) {
    const p = curve.getPointAt(i / (samples - 1));
    tex.set([p.x, p.y, p.z, 1], i * 4);
  }
  const dt = new THREE.DataTexture(
    tex,
    samples,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  dt.minFilter = dt.magFilter = THREE.LinearFilter;
  dt.needsUpdate = true;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3),
    rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2,
      rr = Math.sqrt(r()) * radius;
    pos.set([Math.cos(a) * rr, Math.sin(a) * rr, 0], i * 3);
    rnd.set([r(), r(), r(), r()], i * 4);
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
  g.setAttribute(
    "aCol",
    new THREE.BufferAttribute(palAttr(count, colors, r, 1), 3),
  );
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCurve: { value: dt },
      uSize: { value: size },
      uInt: { value: intensity },
      uSpeed: { value: speed },
      uSpan: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uSize, uInt, uSpeed, uSpan; uniform sampler2D uCurve; attribute vec4 aRnd; attribute vec3 aCol;
      varying vec3 vCol; varying float vA;
      void main(){
        float u = fract(aRnd.x + uTime * uSpeed * (0.6 + aRnd.y * 0.8));
        u *= uSpan;
        vec3 c = texture2D(uCurve, vec2(u, 0.5)).xyz;
        vec3 c2 = texture2D(uCurve, vec2(min(u + 0.002, 1.0), 0.5)).xyz;
        vec3 T = normalize(c2 - c + 1e-5); vec3 N = normalize(cross(T, vec3(0.0, 1.0, 0.0)) + 1e-5); vec3 Bn = cross(T, N);
        vec3 p = c + N * position.x + Bn * position.y;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vCol = aCol * uInt; vA = smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(uSpan - 0.05, uSpan, u)) * (0.4 + 0.6 * aRnd.z);
        gl_PointSize = uSize * (0.5 + aRnd.w) * (10.0 / -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: SPRITE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.update = (t, o = {}) => {
    mat.uniforms.uTime.value = t;
    if (o.intensity != null) mat.uniforms.uInt.value = o.intensity;
    if (o.span != null) mat.uniforms.uSpan.value = o.span;
  };
  return pts;
}

/**
 * Explosao radial de faiscas a partir de t0 (funcao fechada do tempo: posicao = v*dt + g*dt^2).
 */
export function sparkBurst({
  count = 1500,
  seed = 3,
  t0 = 0,
  speed = 8,
  gravity = -3,
  colors = [0xffffff, 0x7c5cff, 0x22d3ee],
  size = 20,
  intensity = 5,
  life = 2.2,
} = {}) {
  const r = rng(seed);
  const g = new THREE.BufferGeometry();
  const vel = new Float32Array(count * 3),
    rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1,
      th = r() * Math.PI * 2,
      s = Math.sqrt(1 - u * u),
      v = speed * (0.3 + r());
    vel.set([Math.cos(th) * s * v, u * v, Math.sin(th) * s * v], i * 3);
    rnd.set([r(), r(), r(), r()], i * 4);
  }
  g.setAttribute("position", new THREE.BufferAttribute(vel, 3));
  g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
  g.setAttribute(
    "aCol",
    new THREE.BufferAttribute(palAttr(count, colors, r, 1), 3),
  );
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uT0: { value: t0 },
      uG: { value: gravity },
      uSize: { value: size },
      uInt: { value: intensity },
      uLife: { value: life },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uT0, uG, uSize, uInt, uLife; attribute vec4 aRnd; attribute vec3 aCol; varying vec3 vCol; varying float vA;
      void main(){ float dt = uTime - uT0; float L = uLife * (0.5 + aRnd.x * 0.5);
        float k = 1.0 - exp(-dt * 2.2);
        vec3 p = position * k / 2.2 * 2.0 + vec3(0.0, uG * dt * dt * 0.5, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = (dt < 0.0) ? 0.0 : clamp(1.0 - dt / L, 0.0, 1.0); vCol = aCol * uInt;
        gl_PointSize = uSize * (0.4 + aRnd.w) * (10.0 / -mv.z) * vA; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: SPRITE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.update = (t) => {
    mat.uniforms.uTime.value = t;
  };
  pts.setT0 = (x) => {
    mat.uniforms.uT0.value = x;
  };
  return pts;
}

/**
 * Amostra os pixeis de um texto desenhado em canvas 2D e devolve alvos 3D (Float32Array xyz).
 * A fonte CSS tem de estar carregada (document.fonts.load) antes de chamar.
 */
export function textPoints(text, { font = '900 260px "Inter"', width = 1400, height = 400, step = 4, scale = 0.01, max = 20000, seed = 9 } = {}) {
  const c = document.createElement("canvas"); c.width = width; c.height = height;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.font = font; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, width / 2, height / 2);
  const d = x.getImageData(0, 0, width, height).data, pts = [];
  for (let yy = 0; yy < height; yy += step) for (let xx = 0; xx < width; xx += step) if (d[(yy * width + xx) * 4 + 3] > 128) pts.push((xx - width / 2) * scale, (height / 2 - yy) * scale, 0);
  const r = rng(seed), n = pts.length / 3;
  // baralha com semente e corta a max
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const m = Math.min(n, max), out = new Float32Array(m * 3);
  for (let i = 0; i < m; i++) out.set(pts.slice(idx[i] * 3, idx[i] * 3 + 3), i * 3);
  return out;
}

/**
 * Particulas que saem de uma nuvem (esfera) e se juntam nos alvos (ex.: textPoints).
 * update(t, p) com p = progresso 0..1 da montagem (cada particula com atraso proprio).
 */
export function morphParticles(targets, { seed = 4, radius = 14, colors = [0x7c5cff, 0x22d3ee, 0xff3d81, 0xc6ff3d], size = 16, intensity = 3.5, jitter = 0.04 } = {}) {
  const r = rng(seed), n = targets.length / 3;
  const g = new THREE.BufferGeometry();
  const from = new Float32Array(n * 3), rnd = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), rr = radius * (0.4 + r() * 0.6); from.set([Math.cos(th) * s * rr, u * rr, Math.sin(th) * s * rr], i * 3); rnd.set([r(), r(), r(), r()], i * 4); }
  g.setAttribute("position", new THREE.BufferAttribute(targets, 3));
  g.setAttribute("aFrom", new THREE.BufferAttribute(from, 3));
  g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
  g.setAttribute("aCol", new THREE.BufferAttribute(palAttr(n, colors, r, 1), 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uP: { value: 0 }, uSize: { value: size }, uInt: { value: intensity }, uJit: { value: jitter } },
    vertexShader: /* glsl */ `
      uniform float uTime, uP, uSize, uInt, uJit; attribute vec3 aFrom; attribute vec4 aRnd; attribute vec3 aCol; varying vec3 vCol; varying float vA;
      ${NOISE_GLSL}
      void main(){
        float d = aRnd.x * 0.45; float k = clamp((uP - d) / 0.55, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k);
        vec3 swirl = vec3(sin(uTime * 0.5 + aRnd.y * 6.28), cos(uTime * 0.4 + aRnd.z * 6.28), sin(uTime * 0.3 + aRnd.w * 6.28)) * 1.5;
        vec3 p = mix(aFrom + swirl, position, k);
        p += vec3(snoise(position * 2.0 + uTime * 0.6), snoise(position * 2.0 + 9.0 + uTime * 0.6), 0.0) * uJit * k;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vCol = aCol * uInt * (0.7 + 0.6 * k); vA = 0.35 + 0.65 * k;
        gl_PointSize = uSize * (0.5 + aRnd.w * 0.8) * (10.0 / -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: SPRITE_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  pts.update = (t, p) => { mat.uniforms.uTime.value = t; mat.uniforms.uP.value = p; };
  return pts;
}
