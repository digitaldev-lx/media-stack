// Agua grande: addon Water (three/examples) com normal map gerado em codigo (sem ficheiros externos).
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { rng } from "./core.js";

/** Normal map tileable gerado por soma de ondas com frequencias inteiras (semente fixa). */
export function waterNormals(size = 256, seed = 7, waves = 24) {
  const r = rng(seed);
  const W = [];
  for (let i = 0; i < waves; i++) {
    const fx = Math.round((r() - 0.5) * 16),
      fy = Math.round((r() - 0.5) * 16);
    W.push([fx || 1, fy || 1, r() * Math.PI * 2, 1 / (1 + Math.hypot(fx, fy))]);
  }
  const data = new Uint8Array(size * size * 4);
  const h = (x, y) =>
    W.reduce(
      (s, [fx, fy, ph, a]) =>
        s + a * Math.sin(2 * Math.PI * (fx * x + fy * y) + ph),
      0,
    );
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        e = 1 / size;
      const dx = (h(u + e, v) - h(u - e, v)) * 2.2,
        dy = (h(u, v + e) - h(u, v - e)) * 2.2;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Superficie de agua com reflexo do cenario. update(t) avanca as ondas pelo tempo da timeline.
 */
export function waterPlane({
  size = 200,
  color = 0x061a2a,
  sunColor = 0xffffff,
  sunDirection = new THREE.Vector3(0.3, 1, -0.6),
  distortion = 2.2,
  resolution = 1024,
  speed = 0.6,
} = {}) {
  const w = new Water(new THREE.PlaneGeometry(size, size), {
    textureWidth: resolution,
    textureHeight: resolution,
    waterNormals: waterNormals(),
    sunDirection: sunDirection.clone().normalize(),
    sunColor,
    waterColor: color,
    distortionScale: distortion,
    fog: false,
    alpha: 1,
  });
  w.rotation.x = -Math.PI / 2;
  w.update = (t) => {
    w.material.uniforms.time.value = t * speed;
  };
  return w;
}
