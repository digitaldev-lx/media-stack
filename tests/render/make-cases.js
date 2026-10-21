'use strict';
// Gera, com o compose.js REAL do gateway, uma composicao por layout que a API hoje renderiza,
// com assets sinteticos (ffmpeg): gradiente+legendas por palavra, slides, imagem (ken burns), video de fundo, badge, audio.
// Uso: node tests/render/make-cases.js <work_dir>
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const { build } = require('../../gateway/lib/compose');
const c3 = require('../../gateway/lib/compose3d');
const WORK = path.resolve(process.argv[2] || 'work');
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const cases = {
  'v-caption-words': { format: 'vertical', badge: 'Voz e musica geradas por IA', audio: true, scenes: [
    { start: 0, duration: 3, layout: 'caption', title: 'Titulo da cena', chunks: [{ text: 'Primeira legenda', start: 0.3, end: 1.4 }, { text: 'segunda parte', start: 1.4, end: 2.8 }] },
    { start: 3, duration: 3, layout: 'caption', caption: 'Legenda de cena inteira' }] },
  'h-presentation': { format: 'horizontal', audio: true, scenes: [
    { start: 0, duration: 4, layout: 'slide', title: 'Mapa de processos', bullets: ['Observar', 'Medir', 'Resolver'] },
    { start: 4, duration: 3, layout: 'slide', title: 'Segundo slide', bullets: ['Um ponto'] }] },
  's-image': { format: 'square', audio: false, img: true, scenes: [{ start: 0, duration: 4, layout: 'caption', caption: 'Imagem com ken burns', image: 'img0.jpg' }] },
  'v-video-bg': { format: 'vertical', audio: true, vid: true, badge: 'IA', scenes: [
    { start: 0, duration: 4, layout: 'caption', caption: 'Video de fundo', video: 'bg0.mp4' },
    { start: 4, duration: 2, layout: 'caption', caption: 'Gradiente' }] },
};
// caso 3D (kind video3d), opcional: node make-cases.js <dir> --3d
if (process.argv.includes('--3d')) {
  const name = 'video3d-h'; const dir = path.join(WORK, name); fs.mkdirSync(dir, { recursive: true });
  const v = c3.validate({ scenes: [{ text: '</>', title: 'Teste 3D' }, { preset: 'glass-stack', layers: ['Um', 'Dois', 'Tres'] }, { preset: 'neon-logo', text: 'hf3d', subtitle: 'render no contentor' }] }, { maxScenes: 6 });
  const scenes = v.scenes.map((s, i) => ({ ...s, start: i * 3, duration: 3, chunks: [{ text: `cena ${i + 1}`, start: i * 3 + 0.4, end: i * 3 + 2.6 }] }));
  const total = 9.2;
  ff('-f', 'lavfi', '-i', `sine=frequency=220:duration=${total}`, '-ac', '2', '-ar', '48000', path.join(dir, 'mix.wav'));
  fs.writeFileSync(path.join(dir, 'index.html'), c3.build({ scenes, transitions: v.transitions, format: 'horizontal', audio: 'mix.wav', badge: 'IA', total }).html);
  c3.writePresets(dir);
  fs.writeFileSync(path.join(dir, 'expect.json'), JSON.stringify({ total, format: 'horizontal', audio: true, kit: true }));
  console.log(name, total);
}
for (const [name, c] of Object.entries(cases)) {
  const dir = path.join(WORK, name); fs.mkdirSync(dir, { recursive: true });
  const total = Math.round((c.scenes.reduce((m, s) => Math.max(m, s.start + s.duration), 0) + 0.2) * 100) / 100;
  if (c.audio) ff('-f', 'lavfi', '-i', `sine=frequency=330:duration=${total}`, '-ac', '2', '-ar', '48000', path.join(dir, 'mix.wav'));
  if (c.img) ff('-f', 'lavfi', '-i', 'testsrc2=size=1600x1600:rate=1', '-frames:v', '1', path.join(dir, 'img0.jpg'));
  if (c.vid) ff('-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30', '-keyint_min', '30', path.join(dir, 'bg0.mp4'));
  const { html } = build({ scenes: c.scenes, format: c.format, audio: c.audio ? 'mix.wav' : null, badge: c.badge || null, total });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'expect.json'), JSON.stringify({ total, format: c.format, audio: !!c.audio }));
  console.log(name, total);
}
