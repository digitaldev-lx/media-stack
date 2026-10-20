// Camaras com caminho (CatmullRom) e alvo, guiadas por u 0..1 (derivado do tempo).
import * as THREE from "three";
import { clamp01, easeInOutCubic } from "./core.js";

/**
 * rig.at(u) posiciona a camara no caminho e aponta ao alvo (alvo tambem pode ser um caminho).
 * Opcional: shake(t, amount) deterministico (somas de senos).
 */
export function cameraPath(
  camera,
  points,
  targets,
  { tension = 0.5, ease = easeInOutCubic } = {},
) {
  const P = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    false,
    "catmullrom",
    tension,
  );
  const T = Array.isArray(targets[0])
    ? new THREE.CatmullRomCurve3(
        targets.map((p) => new THREE.Vector3(...p)),
        false,
        "catmullrom",
        tension,
      )
    : null;
  const tgt = new THREE.Vector3();
  return {
    path: P,
    at(u, { shake = 0, t = 0 } = {}) {
      const k = ease(clamp01(u));
      camera.position.copy(P.getPointAt(k));
      if (T) tgt.copy(T.getPointAt(k));
      else tgt.set(...targets);
      if (shake) {
        camera.position.x +=
          (Math.sin(t * 37.1) + Math.sin(t * 23.3)) * 0.5 * shake;
        camera.position.y +=
          (Math.sin(t * 29.7) + Math.sin(t * 41.9)) * 0.5 * shake;
      }
      camera.lookAt(tgt);
    },
  };
}

/** Orbita simples em volta de um ponto. */
export function orbit(
  camera,
  {
    center = [0, 0, 0],
    radius = 10,
    height = 3,
    a0 = 0,
    a1 = Math.PI / 2,
  } = {},
) {
  const c = new THREE.Vector3(...center);
  return {
    at(u) {
      const a = a0 + (a1 - a0) * u;
      camera.position.set(
        c.x + Math.sin(a) * radius,
        c.y + height,
        c.z + Math.cos(a) * radius,
      );
      camera.lookAt(c);
    },
  };
}

/**
 * Camara por poses no tempo: keys = [[t, [px,py,pz], [tx,ty,tz]], ...].
 * Entre duas poses interpola com ease (posicao e alvo); antes/depois segura a primeira/ultima.
 * Repetir uma pose = segurar. Opcional {shake, drift} deterministicos.
 */
export function cameraKeys(camera, keys, { ease = easeInOutCubic } = {}) {
  const K = keys.map(([t, p, q]) => [t, new THREE.Vector3(...p), new THREE.Vector3(...q)]);
  const pos = new THREE.Vector3(), tgt = new THREE.Vector3();
  return {
    at(t, { shake = 0, drift = 0.06 } = {}) {
      let i = 0; while (i < K.length - 2 && t >= K[i + 1][0]) i++;
      const [t0, p0, q0] = K[i], [t1, p1, q1] = K[Math.min(i + 1, K.length - 1)];
      const u = t1 > t0 ? ease(clamp01((t - t0) / (t1 - t0))) : 1;
      pos.lerpVectors(p0, p1, u); tgt.lerpVectors(q0, q1, u);
      pos.x += Math.sin(t * 0.37) * drift; pos.y += Math.sin(t * 0.29 + 1) * drift * 0.6;
      if (shake) { pos.x += (Math.sin(t * 37.1) + Math.sin(t * 23.3)) * 0.5 * shake; pos.y += (Math.sin(t * 29.7) + Math.sin(t * 41.9)) * 0.5 * shake; }
      camera.position.copy(pos); camera.lookAt(tgt);
    },
  };
}
