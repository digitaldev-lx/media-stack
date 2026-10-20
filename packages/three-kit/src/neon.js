// Neon: tubos e texto emissivos HDR (>1) que o bloom selectivo por luminancia apanha.
import * as THREE from "three";
import { Text } from "troika-three-text";
import { hash } from "./core.js";

/** Cor HDR: cor * intensidade, sem tone mapping no material (o ToneMappingEffect trata). */
export function hdr(color, intensity = 4) {
  return new THREE.Color(color).multiplyScalar(intensity);
}

/**
 * Tubo de neon ao longo de uma curva (ou lista de Vector3).
 * @returns {THREE.Group & {setProgress(p:number), setIntensity(k:number)}}
 */
export function neonTube(
  path,
  {
    color = 0x7c5cff,
    radius = 0.04,
    intensity = 5,
    segments = 240,
    radial = 10,
    closed = false,
    glass = true,
  } = {},
) {
  const curve = Array.isArray(path)
    ? new THREE.CatmullRomCurve3(path, closed, "catmullrom", 0.2)
    : path;
  const g = new THREE.Group();
  const coreGeo = new THREE.TubeGeometry(
    curve,
    segments,
    radius,
    radial,
    closed,
  );
  const coreMat = new THREE.MeshBasicMaterial({
    color: hdr(color, intensity),
    toneMapped: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  g.add(core);
  if (glass) {
    const shellGeo = new THREE.TubeGeometry(
      curve,
      segments,
      radius * 2.2,
      radial,
      closed,
    );
    const shellMat = new THREE.MeshPhysicalMaterial({
      color,
      transmission: 0.9,
      roughness: 0.08,
      thickness: 0.2,
      clearcoat: 1,
      transparent: true,
      opacity: 0.35,
      emissive: color,
      emissiveIntensity: 0.4,
    });
    g.add(new THREE.Mesh(shellGeo, shellMat));
  }
  const per = radial * 6;
  g.curve = curve;
  g.setProgress = (p) =>
    g.children.forEach((m) =>
      m.geometry.setDrawRange(
        0,
        Math.floor(Math.max(0, Math.min(1, p)) * segments) * per,
      ),
    );
  g.setIntensity = (k) => coreMat.color.copy(hdr(color, intensity * k));
  return g;
}

/**
 * Texto 3D (troika, SDF). mode: "neon" (emissivo), "glass" (fisico com transmissao), "chrome".
 * Devolve {mesh, ready} - registar `ready` no buildReady antes do primeiro render.
 */
export function text3d(
  str,
  {
    font,
    size = 1,
    color = 0xffffff,
    mode = "neon",
    intensity = 4,
    anchorX = "center",
    anchorY = "middle",
    letterSpacing = -0.02,
    maxWidth = Infinity,
    outline = 0,
  } = {},
) {
  const t = new Text();
  t.text = str;
  t.font = font;
  t.fontSize = size;
  t.anchorX = anchorX;
  t.anchorY = anchorY;
  t.letterSpacing = letterSpacing;
  t.maxWidth = maxWidth;
  if (outline) {
    t.outlineWidth = outline;
    t.outlineBlur = outline * 2;
    t.outlineColor = color;
    t.outlineOpacity = 0.6;
  }
  if (mode === "neon")
    t.material = new THREE.MeshBasicMaterial({
      color: hdr(color, intensity),
      toneMapped: false,
      transparent: true,
    });
  else if (mode === "glass")
    t.material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      iridescence: 0.7,
      iridescenceIOR: 1.4,
      emissive: color,
      emissiveIntensity: 0.25,
      envMapIntensity: 1.6,
    });
  else
    t.material = new THREE.MeshStandardMaterial({
      color,
      metalness: 1,
      roughness: 0.18,
      envMapIntensity: 1.4,
    });
  const ready = new Promise((res) => t.sync(res));
  return { mesh: t, ready };
}

/** Flicker deterministico de neon: funcao do frame e da semente. */
export function flicker(t, seed = 1, fps = 30, amount = 0.35, rate = 0.08) {
  const f = Math.floor(t * fps);
  const h = hash(f * 0.37 + seed * 17.13);
  return h < rate ? 1 - amount * hash(f + seed) : 1;
}
