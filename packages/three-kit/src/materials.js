// Reflexos e materiais: chao espelhado (Reflector com blur + fade), vidro fisico, cromado, holograma.
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import CustomShaderMaterial from "three-custom-shader-material/vanilla";
import { NOISE_GLSL } from "./noise.js";

const MIRROR_SHADER = {
  name: "HF3DMirror",
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uStrength: { value: 0.6 },
    uBlur: { value: 2.0 },
    uBase: { value: new THREE.Color(0x05050a) },
    uFade: { value: 0.55 },
    uRes: { value: 1024 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix; varying vec4 vUvP; varying vec2 vPlane;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main(){ vUvP = textureMatrix * vec4(position, 1.0); vPlane = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float uStrength; uniform float uBlur; uniform vec3 uBase; uniform float uFade; uniform float uRes;
    varying vec4 vUvP; varying vec2 vPlane;
    #include <logdepthbuf_pars_fragment>
    void main(){
      #include <logdepthbuf_fragment>
      vec2 uv = vUvP.xy / vUvP.w;
      vec3 acc = vec3(0.0); float w = 0.0;
      for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) {
        vec2 o = vec2(float(i), float(j)) * uBlur / uRes; float k = 1.0 / (1.0 + float(i*i + j*j));
        acc += texture2D(tDiffuse, uv + o).rgb * k; w += k; }
      float d = length(vPlane - 0.5) * 2.0;
      float fade = 1.0 - smoothstep(uFade, 1.0, d);
      gl_FragColor = vec4(uBase + acc / w * uStrength * fade * color, 1.0);
    }`,
};

/**
 * Chao espelhado HDR (reflexos do neon tambem fazem bloom).
 * @returns {Reflector & {uniforms}}
 */
export function mirrorFloor({
  size = 80,
  base = 0x040408,
  tint = 0xffffff,
  strength = 0.65,
  blur = 2.5,
  fade = 0.45,
  resolution = 1024,
} = {}) {
  const geo = new THREE.PlaneGeometry(size, size);
  const m = new Reflector(geo, {
    textureWidth: resolution,
    textureHeight: resolution * 0.5625,
    clipBias: 0.003,
    color: tint,
    shader: MIRROR_SHADER,
    multisample: 4,
  });
  m.rotation.x = -Math.PI / 2;
  const u = m.material.uniforms;
  u.uStrength.value = strength;
  u.uBlur.value = blur;
  u.uBase.value = new THREE.Color(base);
  u.uFade.value = fade;
  u.uRes.value = resolution;
  m.uniforms = u;
  return m;
}

/** Vidro fisico: transmissao + clearcoat + iridescencia. */
export function glass({
  color = 0xffffff,
  tint = 0xbfd8ff,
  thickness = 0.8,
  roughness = 0.04,
  iridescence = 0.8,
  ior = 1.5,
  dispersion = 2,
} = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness,
    transmission: 1,
    thickness,
    ior,
    dispersion,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    iridescence,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 480],
    attenuationColor: new THREE.Color(tint),
    attenuationDistance: 3.5,
    envMapIntensity: 1.5,
    specularIntensity: 1,
  });
}

export function chrome({ color = 0xffffff, roughness = 0.12 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 1,
    roughness,
    envMapIntensity: 1.6,
  });
}

/** Metal/plastico escuro brilhante com emissao opcional (cartoes, caixas). */
export function gloss({
  color = 0x111118,
  emissive = 0x000000,
  emissiveIntensity = 0,
  roughness = 0.25,
  clearcoat = 1,
} = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.2,
    clearcoat,
    clearcoatRoughness: 0.1,
    emissive,
    emissiveIntensity,
    envMapIntensity: 1.2,
  });
}

/**
 * Holograma (three-custom-shader-material sobre MeshPhysicalMaterial):
 * fresnel emissivo + scanlines + ruido. Actualizar mat.uniforms.uTime.value = t.
 */
export function hologram({
  color = 0x22d3ee,
  intensity = 3,
  opacity = 0.55,
} = {}) {
  const mat = new CustomShaderMaterial({
    baseMaterial: THREE.MeshPhysicalMaterial,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uInt: { value: intensity },
    },
    vertexShader: /* glsl */ `varying vec3 vWp; varying vec3 vN; void main(){ vWp = (modelMatrix * vec4(position,1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uInt; varying vec3 vWp; varying vec3 vN;
      ${NOISE_GLSL}
      void main(){
        vec3 v = normalize(cameraPosition - vWp);
        float fr = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
        float scan = 0.5 + 0.5 * sin(vWp.y * 60.0 - uTime * 6.0);
        float n = snoise(vec3(vWp * 2.0 + uTime * 0.3));
        csm_Emissive = uColor * uInt * (fr * 1.4 + scan * 0.25 + n * 0.1);
        csm_DiffuseColor = vec4(uColor * 0.1, 1.0);
      }`,
    transparent: true,
    opacity,
    roughness: 0.2,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return mat;
}

/**
 * Agua "de balde": MeshPhysicalMaterial (three-custom-shader-material) com deslocamento de vertices
 * por ondas concentricas e gotas, normais analiticas (csm_Position / csm_Normal).
 * Usar com uma geometria subdividida no plano XY local (ex.: RingGeometry(0.001, r, 160, 80)).
 * Actualizar mat.uniforms.uTime.value = t. Gotas: [x, y, t0] (coordenadas locais).
 */
export function rippleWater({ color = 0x0b3a5c, drops = [], amp = 1, env = 2.0, transmission = 0.5 } = {}) {
  const D = new Array(8).fill(0).map((_, i) => new THREE.Vector3(...(drops[i] || [0, 0, -99])));
  return new CustomShaderMaterial({
    baseMaterial: THREE.MeshPhysicalMaterial,
    uniforms: { uTime: { value: 0 }, uDrops: { value: D }, uAmp: { value: amp } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec3 uDrops[8]; uniform float uAmp;
      ${NOISE_GLSL}
      float hAt(vec2 p){
        float h = 0.0;
        for (int i = 0; i < 8; i++) { float dt = uTime - uDrops[i].z; if (dt < 0.0 || dt > 5.0) continue;
          float d = length(p - uDrops[i].xy); float r = dt * 1.4;
          h += sin((d - r) * 9.0) * exp(-abs(d - r) * 3.0) * exp(-dt * 0.7) * 0.12; }
        h += snoise(vec3(p * 0.9, uTime * 0.35)) * 0.03;
        return h * uAmp;
      }
      void main(){
        vec2 p = position.xy; float e = 0.02;
        float h = hAt(p);
        float hx = (hAt(p + vec2(e, 0.0)) - hAt(p - vec2(e, 0.0))) / (2.0 * e);
        float hy = (hAt(p + vec2(0.0, e)) - hAt(p - vec2(0.0, e))) / (2.0 * e);
        csm_Position = vec3(position.xy, position.z + h);
        csm_Normal = normalize(vec3(-hx, -hy, 1.0));
      }`,
    color, roughness: 0.03, metalness: 0.1, transmission, thickness: 1.2, ior: 1.33, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: env,
  });
}
