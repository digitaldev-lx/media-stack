// Graficos 3D animados: barras de vidro/neon e linha neon, com progresso 0..1 controlado pelo tempo.
import * as THREE from "three";
import { glass } from "./materials.js";
import { neonTube, hdr } from "./neon.js";
import { easeOutBack, clamp01 } from "./core.js";

/**
 * Barras 3D. values: alturas finais. update(p) cresce com stagger. Cada barra tem nucleo emissivo.
 */
export function bars3d(
  values,
  {
    colors = [0x7c5cff, 0xff3d81, 0x22d3ee],
    width = 0.7,
    gap = 0.45,
    depth = 0.7,
    stagger = 0.08,
    glow = 2.5,
  } = {},
) {
  const g = new THREE.Group();
  const items = [];
  const total = values.length * (width + gap) - gap;
  values.forEach((h, i) => {
    const col = colors[i % colors.length];
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(width, 1, depth),
      glass({ tint: col, iridescence: 0.5, thickness: 0.6 }),
    );
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.45, 1, depth * 0.45),
      new THREE.MeshBasicMaterial({ color: hdr(col, glow), toneMapped: false }),
    );
    const x = -total / 2 + i * (width + gap) + width / 2;
    shell.position.x = core.position.x = x;
    g.add(shell, core);
    items.push({ shell, core, h });
  });
  g.update = (p) =>
    items.forEach((it, i) => {
      const k =
        Math.max(
          0.001,
          easeOutBack(
            clamp01(
              (p - i * stagger) / (1 - stagger * (items.length - 1) || 1),
            ),
            1.4,
          ),
        ) * it.h;
      for (const m of [it.shell, it.core]) {
        m.scale.y = k;
        m.position.y = k / 2;
      }
    });
  g.update(0);
  return g;
}

/** Linha de grafico em neon (tubo) que se desenha com update(p). */
export function line3d(
  points,
  { color = 0xc6ff3d, radius = 0.05, intensity = 6 } = {},
) {
  const tube = neonTube(
    points.map((p) => new THREE.Vector3(...p)),
    { color, radius, intensity, segments: 300 },
  );
  tube.update = (p) => tube.setProgress(p);
  tube.update(0);
  return tube;
}
