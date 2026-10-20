// hf3d: kit 3D para HyperFrames. Um so modulo ESM (dist/hf3d.mjs) com three + postprocessing + addons + kit.
import * as THREE from "three";
export { THREE };
export * as POSTPROCESSING from "postprocessing";
export { Reflector } from "three/examples/jsm/objects/Reflector.js";
export { Water } from "three/examples/jsm/objects/Water.js";
export { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
export { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
export { Text } from "troika-three-text";
export { default as CustomShaderMaterial } from "three-custom-shader-material/vanilla";
export { createNoise2D, createNoise3D } from "simplex-noise";

export * from "./core.js";
export { Stage } from "./stage.js";
export { TRANSITIONS } from "./transitions.js";
export { neonTube, text3d, flicker, hdr } from "./neon.js";
export {
  mirrorFloor,
  glass,
  chrome,
  gloss,
  hologram,
  rippleWater,
} from "./materials.js";
export { waterPlane, waterNormals } from "./water.js";
export { particleField, curveFlow, sparkBurst, textPoints, morphParticles } from "./particles.js";
export { lightBeam, glowSprite } from "./light.js";
export { bars3d, line3d } from "./charts.js";
export { cameraPath, orbit, cameraKeys } from "./camera.js";
export { NOISE_GLSL } from "./noise.js";
export const VERSION = "0.1.0";
