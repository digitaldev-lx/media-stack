# Instruções para agentes (Claude Code, Codex, etc.)

O repositório tem duas partes:
1. **Stack de serviços (Docker Compose):** `gateway`, `render-hyperframes`, `tts-local`, `audiogen`, `stt-whisper`, `mixer` e `models`. É uma API assinada que produz vídeo a partir de JSON. Ver `README.md` e `INSTALAR.md`.
2. **Ferramentas de estúdio locais:**
   - `packages/three-kit` (kit 3D hf3d para HyperFrames);
   - `local-audio` (Kokoro, Stable Audio Open, whisper.cpp, mistura e QA);
   - `templates/showcase-3d` (exemplo de ponta a ponta).
   - Ver `docs/WORKFLOW-3D.md`.

## Regras duras

### Repositório público
- Nunca commitar `.env`, chaves, tokens nem caminhos pessoais.
- Nunca commitar pesos de modelos, MP4/WAV gerados, footage ou música de licença incerta.
- Antes de cada commit: `git diff --cached` e um grep por `key|token|secret|sk-|fal_|password`.

### Determinismo na composição
- O único tempo é o `t` da timeline HyperFrames.
- Proibido: `requestAnimationFrame`, `Clock`, `Date.now`, `performance.now`, `Math.random` sem semente.
- Não usar o `GlitchEffect` do postprocessing (usa `Math.random`).
- Partículas e animação em função fechada de `t`.

### WebGL e transições
- Não pôr `<canvas>` WebGL dentro de cenas que usam o `@hyperframes/shader-transitions`, porque sai preto.
- Usar o `Stage` do kit (transições GLSL) ou pré-renderizar o 3D para MP4.

### Áudio
- Música: Stable Audio Open (Community License: comercial abaixo de 1 M USD por ano) ou procedural.
- **Nunca o MusicGen para material publicável** (pesos CC-BY-NC).

### Voz e guião
- Uma ideia por frase.
- Validar os nomes próprios com o Whisper sobre a **mistura completa**.

### QA antes de entregar
- `local-audio/qa.sh`: streams, -14 LUFS, frames sem preto, transcrição.
- Um exit code 0 do render não basta: olhar para os frames.

### Versões
- Exactas. O kit tem `package-lock.json`; usar `npm ci`.
- Para actualizar o three/postprocessing, escolher versões com pelo menos 2 semanas e voltar a renderizar o `examples/demo`.

## Comandos úteis

```bash
cd packages/three-kit && npm ci && npm run build && npm run fonts && npm run demo   # kit + demo de 8 s
cd templates/showcase-3d && ./run.sh                                               # template completo (ver README)
npx hyperframes@0.8.181 lint | check | snapshot --at 1,5,10 | render                # dentro de um projecto
```

## Onde mexer

| Quero... | Ficheiro |
|---|---|
| Novo efeito 3D reutilizável | `packages/three-kit/src/*.js` + export em `src/index.js` + README do kit |
| Nova transição GLSL | `packages/three-kit/src/transitions.js` (`TRANSITIONS` + ramo em `TRANSITION_FRAG`) |
| Nova pronúncia | `lexicon` no `script.json` do projecto + tabela em `local-audio/README.md` |
| Novo SFX | `local-audio/sfx.py` |
| API / pipeline do Compose | `gateway/lib/*.js` |
