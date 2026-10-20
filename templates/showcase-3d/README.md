# Template: vídeo 3D com HyperFrames + hf3d + áudio local

Vídeo 16:9 1080p de exemplo (3 cenas, ~16 s), feito com o kit `packages/three-kit` e as ferramentas `local-audio/`:
- partículas que formam `</>` sobre chão espelhado;
- stack de vidro e neon a abrir;
- logo em neon reflectido em água.

É o esqueleto genérico de um showcase de 11 cenas e 72 s, com o mesmo pipeline.

![](../../docs/img/showcase-3d-template.jpg)

## Estrutura

| Ficheiro | Papel |
|---|---|
| `audio/script.json` | **O guião**: cenas e linhas (uma ideia por frase), voz, léxico de pronúncias, transições entre cenas, prompts da música, marca do fecho |
| `src/scenes.js` | Cenas 3D: uma função por cena que devolve `{scene, camera, update(t)}`. As câmaras vão em `CAMK`, por poses no tempo |
| `src/dom.js` | Camada HTML por cima do canvas: título do gancho sincronizado por palavra, legendas palavra a palavra, HUD e fade final |
| `build.py` | Gera `index.html` com a timeline, as palavras e as transições embebidas |
| `run.sh` | Corre o pipeline completo (ou a partir de `STEP=`) |

## Correr

```bash
export PY_KOKORO=$PWD/../../.venvs/kokoro/bin/python
export PY_AUDIO=$PWD/../../.venvs/audio/bin/python
export WHISPER_MODEL=/caminho/ggml-large-v3-turbo-q5_0.bin
./run.sh                 # tudo
STEP=build ./run.sh      # só composição + render + QA (depois de mexer em src/)
```

Os passos, por ordem:

1. **voice:** `tts_kokoro.py` gera `audio/vo/tNN.wav`.
2. **music:** `music_stableaudio.py` gera `audio/music/segA.wav` e `segB.wav`. Leva cerca de 4 min por faixa no MPS. Salta se o ficheiro já existir.
3. **layout:** `beats.py` mede o BPM real. O `layout.py` gera `timeline.json`: cada cena começa numa batida e a `drop_scene` cai num tempo forte. Daqui saem também as `transitions.json`.
4. **words:** `align_words.py` dá os timestamps palavra a palavra (legendas e animações).
5. **mix:** `mix.py` produz `assets/mix.wav` a -14 LUFS.
6. **build:** copia `hf3d.mjs` e as fontes, corre o `build.py` e o `hyperframes lint`.
7. **render:** `hyperframes render --quality delivery --fps 30` para `renders/showcase.mp4`.
8. **qa:** `qa.sh` faz streams, loudness, frames nos cortes e no fim, e o Whisper sobre a mistura completa.

No QA, um frame marcado `BRANCO?` no meio de uma transição `flash` é intencional. Qualquer `PRETO?` não é.

## Adaptar
- **Nova cena:** acrescentar a entrada em `audio/script.json` (nome e linhas), a função em `src/scenes.js` (registar em `builders`) e as poses em `CAMK`. Cada transição em `script.transitions` liga a cena N à N+1. Os tipos estão em `TRANSITIONS` no kit.
- **Animar ao ritmo da voz:** usar `ln(i)` (início da linha i) e os tempos das palavras (ver `wd` no `dom.js`). Nada de segundos fixos.
- **O gancho HTML** (`build.py` + `dom.js`) assume que a linha 0 tem 6 palavras e a linha 1 tem 8. Mudar os `data-w` e os índices dos chips se o guião mudar.
- **Determinismo:** ver `packages/three-kit/README.md`. Tudo é função de `t`: sem rAF, sem relógio, sem `Math.random`.
