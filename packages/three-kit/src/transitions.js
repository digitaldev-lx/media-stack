// Transicoes GLSL entre duas cenas renderizadas (texturas HDR tA -> tB).
// Tudo e funcao de uMix (0..1) e uTime: deterministico.
export const TRANSITIONS = {
  fade: 0,
  glitch: 1,
  zoom: 2,
  iris: 3,
  warp: 4,
  whip: 5,
  flash: 6,
  ripple: 7,
  pixel: 8,
  burn: 9,
  swirl: 10,
  slices: 11,
};

export const TRANSITION_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tA; uniform sampler2D tB;
uniform float uMix; uniform float uHasB; uniform float uTime; uniform vec2 uRes; uniform vec3 uAccent;
uniform int uType;
varying vec2 vUv;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
vec4 A(vec2 uv){ return texture2D(tA, clamp(uv, 0.0, 1.0)); }
vec4 B(vec2 uv){ return texture2D(tB, clamp(uv, 0.0, 1.0)); }
vec4 zoomBlur(sampler2D t, vec2 uv, float s){ vec4 c = vec4(0.0); vec2 d = uv - 0.5;
  for(int i=0;i<16;i++){ float k = 1.0 - s * float(i) / 16.0; c += texture2D(t, clamp(0.5 + d*k, 0.0, 1.0)); } return c / 16.0; }

void main(){
  vec2 uv = vUv; float m = uMix;
  if (uHasB < 0.5) { gl_FragColor = A(uv); return; }
  float aspect = uRes.x / uRes.y;
  vec4 col;
  if (uType == 1) { // glitch: blocos, linhas, RGB split, posterizacao
    float inten = sin(m * 3.14159);
    float step_ = floor(m * 18.0);
    float line = floor(uv.y * 48.0);
    float dx = (hash(vec2(line, step_)) - 0.5) * 0.25 * inten;
    vec2 blk = floor(uv * vec2(16.0, 9.0));
    float b = step(0.8, hash(blk + step_)) * inten;
    vec2 u2 = uv + vec2(dx, 0.0) + (vec2(hash(blk*1.7), hash(blk*2.3)) - 0.5) * 0.2 * b;
    float sel = step(hash(blk + step_ * 1.3), m);
    float sh = 0.03 * inten;
    vec4 ca = vec4(A(u2 + vec2(sh,0)).r, A(u2).g, A(u2 - vec2(sh,0)).b, 1.0);
    vec4 cb = vec4(B(u2 + vec2(sh,0)).r, B(u2).g, B(u2 - vec2(sh,0)).b, 1.0);
    col = mix(ca, cb, sel);
    col.rgb = mix(col.rgb, floor(col.rgb * 6.0) / 6.0, inten * 0.6);
    col.rgb += uAccent * step(0.97, hash(vec2(line * 3.1, step_))) * inten * 2.0;
  } else if (uType == 2) { // zoom-through com blur radial
    float s1 = smoothstep(0.0, 0.5, m), s2 = 1.0 - smoothstep(0.5, 1.0, m);
    vec2 ua = 0.5 + (uv - 0.5) / (1.0 + s1 * 2.5);
    vec2 ub = 0.5 + (uv - 0.5) * (1.0 + s2 * 1.5);
    vec4 a = zoomBlur(tA, ua, s1 * 0.5), bb = zoomBlur(tB, ub, s2 * 0.5);
    col = mix(a, bb, smoothstep(0.4, 0.6, m));
    col.rgb += vec3(1.0) * pow(sin(m * 3.14159), 6.0) * 0.8;
  } else if (uType == 3) { // iris com anel de luz
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float r = m * 1.25, d = length(p);
    float inside = smoothstep(r, r - 0.01, d);
    col = mix(A(uv), B(uv), inside);
    col.rgb += uAccent * 6.0 * exp(-pow((d - r) * 60.0, 2.0)) * sin(m * 3.14159);
  } else if (uType == 4) { // domain warp: dissolve organico com borda incandescente
    float n = fbm(uv * 3.0 + vec2(fbm(uv * 2.0 + uTime * 0.1)));
    float e = m * 1.3 - 0.15;
    float k = smoothstep(e - 0.05, e + 0.05, n);
    vec2 w = (vec2(fbm(uv * 4.0), fbm(uv * 4.0 + 7.0)) - 0.5) * 0.08 * sin(m * 3.14159);
    col = mix(B(uv + w), A(uv - w), k);
    col.rgb += uAccent * 5.0 * (1.0 - abs(k * 2.0 - 1.0)) * step(0.01, m) * step(m, 0.99);
  } else if (uType == 5) { // whip pan: arrastamento horizontal com blur de movimento
    float dir = 1.0; float s = sin(m * 3.14159);
    vec4 c = vec4(0.0);
    for (int i = 0; i < 20; i++) { float o = (float(i) / 20.0 - 0.5) * 0.25 * s;
      vec2 ua = uv + vec2(m * 1.0 * dir + o, 0.0); vec2 ub = uv + vec2((m - 1.0) * dir + o, 0.0);
      c += (ua.x <= 1.0) ? A(ua) : B(ub); }
    col = c / 20.0;
  } else if (uType == 6) { // flash atraves do branco
    float f = pow(sin(m * 3.14159), 2.0);
    col = mix(A(uv), B(uv), step(0.5, m));
    col.rgb = mix(col.rgb, vec3(6.0), f);
  } else if (uType == 7) { // ondas concentricas
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0); float d = length(p);
    float s = sin(m * 3.14159);
    vec2 off = normalize(p + 1e-5) * sin(d * 40.0 - m * 30.0) * 0.02 * s;
    col = mix(A(uv + off), B(uv + off), smoothstep(0.3, 0.7, m));
  } else if (uType == 8) { // pixelizacao
    float s = sin(m * 3.14159); float px = mix(1.0, 64.0, s);
    vec2 g = (floor(uv * uRes / px) + 0.5) * px / uRes;
    col = mix(A(g), B(g), step(0.5, m));
  } else if (uType == 9) { // queimadura com faiscas
    float n = fbm(uv * 5.0);
    float e = m * 1.2;
    float k = smoothstep(e - 0.02, e, n + uv.y * 0.2);
    col = mix(B(uv), A(uv), k);
    float rim = smoothstep(e - 0.08, e - 0.02, n + uv.y * 0.2) * (1.0 - k);
    col.rgb += vec3(4.0, 1.6, 0.4) * rim;
  } else if (uType == 10) { // vortice
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0); float d = length(p);
    float s = sin(m * 3.14159); float ang = s * 6.0 * (1.0 - smoothstep(0.0, 0.9, d));
    mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 q = R * p / vec2(aspect, 1.0) + 0.5;
    col = mix(A(q), B(q), smoothstep(0.35, 0.65, m));
  } else if (uType == 11) { // fatias verticais desfasadas
    float n = 14.0; float idx = floor(uv.x * n);
    float del = hash(vec2(idx, 3.0)) * 0.4;
    float p = clamp((m - del) / 0.6, 0.0, 1.0);
    p = p * p * (3.0 - 2.0 * p);
    float y = uv.y + p * (mod(idx, 2.0) < 0.5 ? 1.0 : -1.0);
    col = (y >= 0.0 && y <= 1.0) ? A(vec2(uv.x, y)) : B(vec2(uv.x, fract(y)));
  } else {
    col = mix(A(uv), B(uv), m);
  }
  gl_FragColor = col;
}
`;
