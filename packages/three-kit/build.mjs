// Gera dist/hf3d.mjs: um unico ficheiro ESM com tudo (sem CDN em tempo de render).
import { build } from "esbuild";
import { readFileSync } from "node:fs";
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url)),
);
await build({
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: "dist/hf3d.mjs",
  legalComments: "eof",
  banner: {
    js: `/* hf3d ${pkg.version} - three ${pkg.dependencies.three}, postprocessing ${pkg.dependencies.postprocessing}, troika-three-text ${pkg.dependencies["troika-three-text"]}, three-custom-shader-material ${pkg.dependencies["three-custom-shader-material"]}, simplex-noise ${pkg.dependencies["simplex-noise"]} */`,
  },
  logLevel: "info",
});
