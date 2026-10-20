// hf3d core: aleatorio com semente, helpers de tempo e ligacao a timeline HyperFrames.
// REGRA: nada aqui le relogios. O unico tempo que existe e o `t` que a timeline entrega.

/** PRNG mulberry32 com semente. Nunca usar Math.random em codigo de render. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash 1D -> [0,1). Util para flicker/jitter funcao do frame. */
export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, x) => a + (b - a) * x;
/** Progresso 0..1 de t dentro de [t0, t0+d]. */
export const prog = (t, t0, d) => clamp01((t - t0) / d);
export const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOutCubic = (x) => {
  x = clamp01(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutBack = (x, s = 1.70158) => {
  x = clamp01(x);
  const c3 = s + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
};
export const easeOutElastic = (x) => {
  x = clamp01(x);
  if (x === 0 || x === 1) return x;
  return (
    Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
  );
};
/** Pulso que decai a partir de cada batida (0..1). */
export function beatPulse(t, beat0, beat, decay = 7) {
  if (t < beat0) return 0;
  const ph = ((t - beat0) % beat) / beat;
  return Math.exp(-ph * decay);
}

/**
 * Liga uma funcao render(t) a uma timeline GSAP pausada do HyperFrames.
 * Usa um proxy com onUpdate, para nao roubar o onUpdate da timeline.
 */
export function bindTimeline(tl, duration, render) {
  const clock = { t: 0 };
  tl.fromTo(
    clock,
    { t: 0 },
    { t: duration, duration, ease: "none", onUpdate: () => render(clock.t) },
    0,
  );
  return clock;
}

/**
 * Regista uma promessa no buildReady do HyperFrames: o render espera por ela
 * (fontes do troika, texturas geradas, shaders compilados).
 */
export function holdUntilReady(name, promise) {
  window.__hf = window.__hf || {};
  window.__hf.buildReady = window.__hf.buildReady || {};
  window.__hf.buildReady[name] = promise;
  return promise;
}
