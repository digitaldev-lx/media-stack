'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { sign } = require('./sign');
const policy = require('./policy');
const pexels = require('./pexels');
const spend = require('./spend');
const { build } = require('./compose');
const compose3d = require('./compose3d');

// limites do kind video3d (render 3D por SwiftShader e caro em CPU; ver README)
const LIM3D = {
  maxSeconds: Number(process.env.VIDEO3D_MAX_SECONDS || 45),
  maxScenes: Number(process.env.VIDEO3D_MAX_SCENES || 6),
  timeoutS: Number(process.env.VIDEO3D_RENDER_TIMEOUT_S || 2400),
};

const WORK = process.env.WORK_DIR || '/work';
const URLS = {
  tts: process.env.TTS_URL || 'http://tts-local:8000', music: process.env.MUSIC_URL || 'http://music-gen:8000',
  sfx: process.env.SFX_URL || 'http://sfx-gen:8000', stt: process.env.STT_URL || 'http://stt-whisper:8000',
  mixer: process.env.MIXER_URL || 'http://mixer:8000', render: process.env.RENDER_URL || 'http://render-hyperframes:3000',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(base, p, body, timeoutMs = 600000) {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${base}${p} -> ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

// ---- providers de voz: fal (Eleven v3, por omissao em producao) com fallback automatico para Piper local
async function ttsFal(text, voice, out) {
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY nao definida');
  const model = (voice && voice.model) || process.env.FAL_TTS_MODEL || 'fal-ai/elevenlabs/tts/eleven-v3';
  const body = { text, voice: (voice && voice.voice) || process.env.FAL_VOICE, language_code: (voice && voice.language_code) || process.env.FAL_LANGUAGE_CODE || 'pt' };
  if (!body.voice) delete body.voice;
  if (process.env.FAL_STABILITY) body.stability = Number(process.env.FAL_STABILITY);
  const r = await fetch(`https://fal.run/${model}`, { method: 'POST',
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`fal ${r.status}: ${(await r.text()).slice(0, 200).replace(/Key\s+\S+/g, 'Key ***')}`);
  const j = await r.json(); const url = j.audio && j.audio.url;
  if (!url) throw new Error('fal sem audio.url');
  const a = await fetch(url, { signal: AbortSignal.timeout(120000) });
  const raw = path.join(WORK, out + '.src'); await fsp.writeFile(raw, Buffer.from(await a.arrayBuffer()));
  await new Promise((res, rej) => require('child_process').execFile('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-ac', '1', '-ar', '44100', path.join(WORK, out)], (e) => (e ? rej(e) : res())));
  const pr = await call(URLS.mixer, '/probe', { path: out });
  return { path: out, duration: pr.duration, engine: 'fal' };
}
async function ttsLocal(text, voice, out) {
  return call(URLS.tts, '/tts', { text, engine: 'piper',
    voice: (voice && voice.local_voice) || process.env.TTS_VOICE || 'pt_PT-tugao-medium', speed: (voice && voice.speed) || 1.0, out });
}
// ctx = { spent, warnings }: gasto fal do pedido e avisos (fallback, tectos)
async function tts(text, voice, out, ctx) {
  const provider = (voice && voice.provider) || process.env.TTS_PROVIDER || 'local';
  if (provider !== 'fal') return ttsLocal(text, voice, out);
  const fallback = (process.env.TTS_FALLBACK || 'local') === 'local';
  const chk = spend.check(text.length, ctx.spent);
  try {
    if (!chk.ok) throw new Error(chk.reason);
    const r = await ttsFal(text, voice, out);
    spend.record(chk.usd); ctx.spent += chk.usd; ctx.fal_usd = (ctx.fal_usd || 0) + chk.usd;
    return r;
  } catch (e) {
    if (!fallback) throw e;
    ctx.warnings.push(`voz fal indisponivel, usado Piper local: ${String(e.message).slice(0, 200)}`);
    ctx.fell_back = true;
    return ttsLocal(text, voice, out);
  }
}

async function fetchAsset(ref, dir, name) {
  const dest = path.join(dir, name);
  if (ref.startsWith('library:')) {
    const { full, credit } = policy.resolveLibrary(ref);
    await fsp.copyFile(full, dest); return { name, credit };
  }
  const url = policy.checkUrl(ref);
  const r = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'user-agent': 'media-gateway/1.0' } });
  if (!r.ok) throw new Error(`asset ${r.status}: ${url.hostname}`);
  await fsp.writeFile(dest, Buffer.from(await r.arrayBuffer())); return { name, credit: null };
}

function wordChunks(words, start, max = 4) {
  const out = [];
  for (let i = 0; i < words.length; i += max) {
    const g = words.slice(i, i + max);
    out.push({ text: g.map((w) => w.w).join(' '), start: start + g[0].start, end: start + g[g.length - 1].end });
  }
  // contiguas e sem sobreposicao: cada legenda dura ate comecar a seguinte (a ultima ganha 0,3 s)
  out.forEach((c, i) => { c.end = i + 1 < out.length ? out[i + 1].start : c.end + 0.3; });
  return out;
}

// video3d: legendas com o TEXTO do guiao e os tempos do STT (o STT so da o ritmo; nao reescreve o que se disse)
function scriptWords(narration, words) {
  const toks = String(narration || '').split(/\s+/).filter(Boolean);
  if (!toks.length || !words.length) return words;
  if (toks.length === words.length) return toks.map((w, i) => ({ w, start: words[i].start, end: words[i].end }));
  const t0 = words[0].start, t1 = words[words.length - 1].end, tot = toks.reduce((n, w) => n + w.length + 1, 0);
  let acc = 0;
  return toks.map((w) => { const a = t0 + (acc / tot) * (t1 - t0); acc += w.length + 1; return { w, start: a, end: t0 + (acc / tot) * (t1 - t0) }; });
}

async function runMedia(job, step) {
  const spec = job.spec; const id = job.id; const dir = path.join(WORK, id);
  await fsp.mkdir(dir, { recursive: true });
  const kind = job.kind; const rel = (f) => `${id}/${f}`;
  const result = { steps: [], credits: [], ai_generated: [], warnings: [] };
  const ctx = { spent: 0, warnings: result.warnings };

  if (kind === 'tts') {
    await step('tts'); const r = await tts(spec.text, spec.voice, rel('out.wav'), ctx);
    return { ...result, output: { file: 'out.wav', duration: r.duration, content_type: 'audio/wav' } };
  }
  if (kind === 'music') {
    await step('music'); const r = await call(URLS.music, '/music', { prompt: spec.prompt || '', duration: spec.duration || 30, engine: spec.engine || 'procedural', seed: spec.seed, out: rel('out.wav') });
    return { ...result, output: { file: 'out.wav', duration: r.duration, content_type: 'audio/wav' } };
  }
  if (kind === 'sfx') {
    await step('sfx'); const r = await call(URLS.sfx, '/sfx', { kind: spec.type || 'whoosh', prompt: spec.prompt || '', duration: spec.duration || 3, engine: spec.engine || 'procedural', seed: spec.seed, out: rel('out.wav') });
    return { ...result, output: { file: 'out.wav', duration: r.duration, content_type: 'audio/wav' } };
  }
  if (kind === 'stt') {
    throw new Error('kind=stt requer um ficheiro em /work (uso interno); usar kind=video com captions:"words"');
  }

  // ---- video | presentation | video3d
  const is3d = kind === 'video3d';
  const v3 = is3d ? compose3d.validate(spec, LIM3D) : null;   // valida presets/textos ANTES de gastar voz
  const scenesIn = is3d ? v3.scenes : (Array.isArray(spec.scenes) ? spec.scenes : []);
  if (!scenesIn.length) throw new Error('spec.scenes vazio');
  const isPres = kind === 'presentation';
  const format = spec.format || (isPres || is3d ? 'horizontal' : 'vertical');
  const tail = 0.35; const lead = 0.25; const minDur = 2;
  const voiceClips = []; const scenes = []; const assets = []; let cursor = 0;
  const syntheticVoice = scenesIn.some((s) => s.narration);

  for (let i = 0; i < scenesIn.length; i++) {
    const s = scenesIn[i]; let dur = Number(s.duration) || (isPres ? 5 : is3d ? 4.5 : 4); let words = null;
    if (s.narration) {
      await step(`tts scene ${i + 1}/${scenesIn.length}`);
      const r = await tts(s.narration, spec.voice, rel(`v${i}.wav`), ctx);
      dur = Math.max(is3d ? 3.5 : minDur, r.duration + lead + tail, Number(s.duration) || 0); // 3D: tempo para a camara e a montagem
      voiceClips.push({ file: rel(`v${i}.wav`), at: r2(cursor + lead) });
      if ((spec.captions || (is3d ? 'words' : null)) === 'words') {
        await step(`stt scene ${i + 1}`);
        words = (await call(URLS.stt, '/stt', { path: rel(`v${i}.wav`), language: (spec.voice && spec.voice.language_code) || 'pt' })).words;
      }
    }
    let image = null; let video = null;
    if (is3d) { /* video3d: sem stock nem imagens; o visual e 3D gerado */ } else if (s.stock) {
      await step(`pexels scene ${i + 1}`);
      const pk = await pexels.pick(s.stock, format);
      const ext = pk.kind === 'photo' ? 'jpg' : 'mp4';
      const a = await fetchAsset(pk.url, dir, `stock${i}.${ext}`);
      assets.push({ scene: i, file: a.name, url: pk.url, ...pk.attribution });
      result.credits.push(pk.attribution);
      if (pk.kind === 'photo') image = a.name;
      else {
        await step(`prep video scene ${i + 1}`);
        await call(URLS.mixer, '/prep-video', { src: rel(a.name), dst: rel(`bg${i}.mp4`), duration: dur, format });
        video = `bg${i}.mp4`;
      }
    } else if (s.video_src) {
      const a = await fetchAsset(s.video_src, dir, `vsrc${i}.mp4`); if (a.credit) result.credits.push(a.credit);
      await step(`prep video scene ${i + 1}`);
      await call(URLS.mixer, '/prep-video', { src: rel(a.name), dst: rel(`bg${i}.mp4`), duration: dur, format });
      video = `bg${i}.mp4`;
    } else if (s.image) {
      const ext = (String(s.image).split('?')[0].match(/\.(png|jpe?g|webp)$/i) || [null, 'jpg'])[1];
      const a = await fetchAsset(s.image, dir, `img${i}.${ext}`); image = a.name; if (a.credit) result.credits.push(a.credit);
    }
    const layout = s.layout || (isPres || (s.bullets && s.bullets.length) ? 'slide' : 'caption');
    const sc = is3d ? { start: cursor, duration: dur, preset: s.preset, text: s.text, subtitle: s.subtitle, layers: s.layers, color: s.color, title: s.title }
      : { start: cursor, duration: dur, layout, title: s.title, bullets: s.bullets, image, video, caption: s.caption ?? (layout === 'caption' ? s.narration : null) };
    if (words && words.length) sc.chunks = wordChunks(is3d ? scriptWords(s.narration, words) : words, cursor + lead);
    scenes.push(sc); cursor += dur;
  }
  const total = r2(cursor + 0.2);
  if (is3d && total > LIM3D.maxSeconds) throw new Error(`video3d: duracao ${total} s acima do limite de ${LIM3D.maxSeconds} s (VIDEO3D_MAX_SECONDS)`);

  // musica + SFX (gratis, locais) e mistura
  let music = null; const sfxClips = [];
  if (spec.music !== false && spec.music !== null) {
    const m = spec.music || {}; await step('music');
    await call(URLS.music, '/music', { prompt: m.prompt || 'corporate calm', duration: total, engine: m.engine || 'procedural', seed: m.seed, out: rel('music.wav') }, 1800000);
    music = { file: rel('music.wav'), volume: m.volume ?? 0.3 };
    if ((m.engine || 'procedural') !== 'procedural') result.ai_generated.push(`music:${m.engine}`);
  }
  const sfxSpec = spec.sfx === false ? [] : (spec.sfx || scenes.slice(1).map((s) => ({ type: 'whoosh', at: s.start })));
  const made = new Map();
  for (const f of sfxSpec) {
    const key = `${f.type}|${f.engine || 'procedural'}`;
    if (!made.has(key)) {
      await step(`sfx ${f.type}`); const n = `sfx_${made.size}.wav`;
      await call(URLS.sfx, '/sfx', { kind: f.type, prompt: f.prompt || '', duration: f.duration || 2, engine: f.engine || 'procedural', seed: f.seed, out: rel(n) });
      made.set(key, rel(n));
    }
    sfxClips.push({ file: made.get(key), at: Math.max(0, r2(f.at - 0.05)), volume: f.volume ?? 0.5 });
  }
  if (voiceClips.length || music || sfxClips.length) {
    await step('mix');
    await call(URLS.mixer, '/mix', { duration: total, voice: voiceClips, music, sfx: sfxClips, duck: true, lufs: spec.lufs ?? -14, out: rel('mix.wav') });
  }

  // composicao + render
  if (assets.length) await fsp.writeFile(path.join(dir, 'assets.json'), JSON.stringify(assets, null, 1));
  await step('compose');
  const badgeOn = spec.ai_badge !== false && (syntheticVoice || result.ai_generated.length);
  const badge = badgeOn ? (spec.ai_badge_text || 'Voz e musica geradas por IA') : null;
  const audioRef = (voiceClips.length || music || sfxClips.length) ? 'mix.wav' : null;
  const { html } = is3d
    ? compose3d.build({ scenes, transitions: v3.transitions, format, audio: audioRef, badge, total })
    : build({ scenes, format, theme: spec.theme, audio: audioRef, badge, total });
  await fsp.writeFile(path.join(dir, 'index.html'), html);
  if (is3d) compose3d.writePresets(dir);
  await step('render');
  const timeoutS = is3d ? Math.min(Number(spec.timeout_s) || LIM3D.timeoutS, LIM3D.timeoutS) : (spec.timeout_s || 1800);
  let sub;
  for (let w = 0; ; w++) { // o worker aceita 1 render 3D de cada vez (429): esperar a vez, ate 30 min
    try { sub = await call(URLS.render, '/render', { dir: id, out: 'output.mp4', timeout_s: timeoutS, kit: is3d }); break; }
    catch (e) { if (!/-> 429/.test(e.message) || w > 360) throw e; if (w === 0) await step('render (a espera do worker 3D)'); await sleep(5000); }
  }
  await step('render');
  let misses = 0; const t0 = Date.now(); const limit = timeoutS * 1000 + 30000;
  for (;;) {
    await sleep(2000);
    let st;
    try { st = await (await fetch(`${URLS.render}/render/${sub.id}`, { signal: AbortSignal.timeout(15000) })).json(); misses = 0; }
    catch { if (++misses < 15) continue; st = { status: 'lost' }; } // tolera falhas transitorias de rede (~30 s)
    if (st.status === 'succeeded') break;
    if (st.status === 'failed') throw new Error(`render: ${st.error}`);
    if (st.status === 'lost') throw new Error('render worker perdeu o job (reiniciou?)');
    if (Date.now() - t0 > limit) throw new Error('render timeout');
  }
  await step('qa');
  const qa = await call(URLS.mixer, '/qa', { path: rel('output.mp4') });
  if (!qa.ok) throw new Error(`QA falhou: ${JSON.stringify(qa)}`);
  result.fal_usd = Math.round((ctx.fal_usd || 0) * 1e4) / 1e4; result.assets = assets;
  return { ...result, qa, output: { file: 'output.mp4', duration: qa.duration, bytes: qa.size, content_type: 'video/mp4', width: qa.video.w, height: qa.video.h } };
}
const r2 = (n) => Math.round(n * 100) / 100;

async function deliver(job) {
  const out = job.result && job.result.output; if (!out) return;
  const put = job.spec && job.spec.output && job.spec.output.put_url;
  if (put) {
    const u = policy.checkUrl(put); // mesmo allowlist; presigned PUT do R2
    const buf = await fsp.readFile(path.join(WORK, job.id, out.file));
    const r = await fetch(u, { method: 'PUT', body: buf, headers: { 'content-type': out.content_type }, signal: AbortSignal.timeout(600000) });
    if (!r.ok) throw new Error(`upload PUT ${r.status}`);
    job.result.output.uploaded = true;
  }
}

async function callback(job) {
  const url = job.callback_url; if (!url) return;
  const allowed = (process.env.CALLBACK_ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  let u; try { u = new URL(url); } catch { return; }
  if (!allowed.includes(u.hostname) || u.protocol !== 'https:') { console.warn(`callback recusado (host nao autorizado): ${u.hostname}`); return; }
  const body = JSON.stringify({ id: job.id, status: job.status, result: job.result, error: job.error, idempotency_key: job.idempotency_key });
  for (let a = 0; a < 5; a++) {
    const ts = String(Math.floor(Date.now() / 1000));
    try {
      const r = await fetch(url, { method: 'POST', body, headers: { 'content-type': 'application/json', 'X-Timestamp': ts, 'X-Job-Id': job.id,
        'X-Signature': sign(ts, 'POST', u.pathname + u.search, body) }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return;
    } catch { /* retry */ }
    await sleep(2000 * 2 ** a);
  }
}
module.exports = { runMedia, deliver, callback, URLS, scriptWords };
