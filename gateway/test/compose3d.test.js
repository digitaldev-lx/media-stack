'use strict';
// node --test (sem dependencias): validacao e composicao do kind video3d.
const test = require('node:test');
const assert = require('node:assert');
const c3 = require('../lib/compose3d');
const LIM = { maxScenes: 6 };

test('presets por omissao: 1.a particulas, ultima logo, meio stack', () => {
  const v = c3.validate({ scenes: [{ narration: 'a' }, { narration: 'b' }, { narration: 'c' }] }, LIM);
  assert.deepStrictEqual(v.scenes.map((s) => s.preset), ['particles-text', 'glass-stack', 'neon-logo']);
  assert.strictEqual(v.transitions.length, 2);
});

test('rejeita preset e transicao desconhecidos (o cliente nao injecta codigo)', () => {
  assert.throws(() => c3.validate({ scenes: [{ preset: 'x' }] }, LIM), /preset invalido/);
  assert.throws(() => c3.validate({ scenes: [{}, {}], transitions: ['<script>'] }, LIM), /transicao invalida/);
});

test('limita numero de cenas e corta textos', () => {
  assert.throws(() => c3.validate({ scenes: new Array(7).fill({}) }, LIM), /maximo 6 cenas/);
  const v = c3.validate({ scenes: [{ text: 'x'.repeat(100), layers: new Array(10).fill('y'.repeat(50)), color: 'red' }] }, LIM);
  assert.strictEqual(v.scenes[0].text.length, 24);
  assert.strictEqual(v.scenes[0].layers.length, 6);
  assert.strictEqual(v.scenes[0].layers[0].length, 28);
  assert.strictEqual(v.scenes[0].color, null);
});

test('HTML: escapa texto, embebe SPEC3D sem </script> e carrega presets.js local', () => {
  const v = c3.validate({ scenes: [{ text: '</script><b>', title: '<img onerror=1>' }, { preset: 'neon-logo', text: 'hf3d' }] }, LIM);
  const scenes = v.scenes.map((s, i) => ({ ...s, start: i * 4, duration: 4, chunks: [{ text: '<i>ola</i>', start: i * 4 + 0.3, end: i * 4 + 1 }] }));
  const { html, W, H } = c3.build({ scenes, transitions: v.transitions, format: 'vertical', audio: 'mix.wav', badge: 'IA', total: 8.2 });
  assert.strictEqual(W, 1080); assert.strictEqual(H, 1920);
  assert.ok(!html.includes('<img onerror'));
  assert.ok(!html.includes('<i>ola</i>'));
  assert.strictEqual(html.split('</script>').length - 1, 3); // gsap, inline, module: o texto do cliente nao fecha scripts
  assert.ok(html.includes('<script type="module" src="presets.js"></script>'));
  assert.ok(!/https?:\/\//.test(html.replace('http://www.w3.org', '')), 'sem CDN');
});

test('video3d: legendas usam o texto do guiao com os tempos do STT', () => {
  const { scriptWords } = require('../lib/pipeline');
  const stt = [{ w: 'de', start: 0.1, end: 0.3 }, { w: 'cinco,', start: 0.3, end: 0.7 }, { w: 'de', start: 0.8, end: 0.9 }, { w: 'nada.', start: 0.9, end: 1.4 }];
  const out = scriptWords('Camada a camada, sem camara.', stt);
  assert.deepStrictEqual(out.map((x) => x.w), ['Camada', 'a', 'camada,', 'sem', 'camara.']);
  assert.strictEqual(out[0].start, 0.1); assert.ok(Math.abs(out[out.length - 1].end - 1.4) < 1e-9);
  const same = scriptWords('um dois', [{ w: 'um', start: 0, end: 0.2 }, { w: 'dois', start: 0.3, end: 0.6 }]);
  assert.deepStrictEqual(same, [{ w: 'um', start: 0, end: 0.2 }, { w: 'dois', start: 0.3, end: 0.6 }]);
});
