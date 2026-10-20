// Luz volumetrica falsa (cones/feixes aditivos com fresnel + ruido) e glow sprites.
// Mais barata e mais controlavel do que god rays de pos-processo, e funciona com varias cenas.
import * as THREE from "three";
import { NOISE_GLSL } from "./noise.js";

/** Feixe de luz conico (spotlight volumetrico). Apontar com .lookAt / rotation. update(t). */
export function lightBeam({
  color = 0x7c5cff,
  height = 12,
  top = 0.15,
  bottom = 3,
  intensity = 1.2,
  noise = 0.6,
} = {}) {
  const geo = new THREE.CylinderGeometry(top, bottom, height, 64, 32, true);
  geo.translate(0, -height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uInt: { value: intensity },
      uNoise: { value: noise },
      uH: { value: height },
    },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vWp; varying float vY; uniform float uH;
      void main(){ vY = -position.y / uH; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime, uInt, uNoise; uniform vec3 uColor; varying vec3 vN; varying vec3 vWp; varying float vY;
      ${NOISE_GLSL}
      void main(){ vec3 v = normalize(cameraPosition - vWp); float fr = pow(abs(dot(normalize(vN), normalize((viewMatrix * vec4(v, 0.0)).xyz))), 1.6);
        float n = 0.5 + 0.5 * snoise(vec3(vWp.x * 0.6, vWp.y * 0.3 - uTime * 0.4, vWp.z * 0.6));
        float a = fr * (1.0 - vY) * (1.0 - uNoise + uNoise * n) * uInt;
        gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.update = (t, k = 1) => {
    mat.uniforms.uTime.value = t;
    mat.uniforms.uInt.value = intensity * k;
  };
  return m;
}

/** Halo/glow em billboard (sprite aditivo HDR). */
export function glowSprite({ color = 0xffffff, size = 2, intensity = 3 } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    color: new THREE.Color(color).multiplyScalar(intensity),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    transparent: true,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}
