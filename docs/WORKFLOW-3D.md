# Workflow 3D local (HyperFrames + three.js + áudio local)

Este é o caminho "estúdio": um vídeo à medida, com cenas 3D a sério, voz e música geradas localmente. É complementar à API do Compose, que produz vídeos a partir de um JSON sem intervenção.

```
guião (script.json) -> voz Kokoro -> música Stable Audio -> batidas -> timeline -> palavras (whisper.cpp)
        -> mistura -14 LUFS -> composição (hf3d + HTML) -> hyperframes render -> QA (ffprobe, frames, loudness, Whisper)
```

Exemplo que corre de ponta a ponta: [`templates/showcase-3d/`](../templates/showcase-3d/README.md). Ferramentas de áudio: [`local-audio/`](../local-audio/README.md). Kit 3D: [`packages/three-kit/`](../packages/three-kit/README.md).

## 1. Guião
- Cenas com nome e linhas. **Uma ideia por frase.**
- Nada de números inventados como factos.
- Tudo o que aparece no ecrã tem de ser verdade sobre o que se mostra.
- Léxico de pronúncias no próprio `script.json` (ver `local-audio/README.md`).

## 2. Voz → 3. Música → 4. Timeline
- A voz sai uma frase por ficheiro, para a timeline conhecer a duração real de cada frase. Nunca estimar durações.
- Música:
  - dois segmentos do Stable Audio (build e drop), com o BPM pedido no prompt e medido com `beats.py`;
  - o segmento A repete-se por compassos até ao drop;
  - o drop cai no tempo forte da cena escolhida.
- Cenas cortadas no beat. As transições ficam centradas no início de cada cena.

## 5. Palavras
whisper.cpp **por frase** (`-ml 1 -sow`), re-ancorado ao início da frase. Junta tokens quando o Whisper parte uma palavra. Serve para as legendas palavra a palavra e para animar ao ritmo da voz.

## 6. Mistura
`mix.py`: ducking por sidechain, cortes de presença na música e `loudnorm` a -14 LUFS. Antes de renderizar, confirmar os nomes próprios com o Whisper sobre a mistura completa.

## 7. Composição
- Um único `<canvas>` WebGL (o `Stage` do hf3d) com todas as cenas 3D. As transições entre cenas são GLSL dentro do GL.
- Por cima, HTML: títulos, legendas e HUD. Como não há captura de DOM, esta camada nunca desaparece nas transições.
- Uma timeline GSAP pausada (`window.__timelines["main"]`). O `bindTimeline` chama `render(t)`.
- O `window.__hf.buildReady` espera pelas fontes troika e pela compilação dos shaders.

### Porque não as transições shader do HyperFrames com WebGL dentro das cenas
- O `@hyperframes/shader-transitions` captura cada cena DOM para textura.
- Um `<canvas>` WebGL dentro de uma cena sai **preto** na captura, mesmo com `preserveDrawingBuffer: true`.
- As camadas fora das cenas desaparecem durante a transição, porque o canvas do shader tapa tudo.
- Alternativas que funcionam:
  - **(A)** Stage único com transições GLSL. É o recomendado e o que o kit faz.
  - **(B)** Pré-renderizar a cena 3D para MP4 e embebê-la como `<video class="clip">`. Os vídeos são capturados bem.
- Provas: `packages/three-kit/docs/`.

### Determinismo (o render pede frames fora de ordem, em vários workers)
- O único tempo é o `t` da timeline. Nada de `requestAnimationFrame`, `setAnimationLoop`, `Clock`, `Date.now()` nem `performance.now()`.
- Posições em função fechada de `t`. As partículas calculam-se no vertex shader a partir de atributos com semente. Não há simulação com estado.
- Aleatoriedade só com semente (`rng(seed)`, `hash(n)`). **Nunca `Math.random`.**
- Pós-processo com tempo fixo: `fullscreenMaterial.time = t` e `composer.render(0)`.
- **O `GlitchEffect` do postprocessing não pode ser usado**, porque chama `Math.random`. O glitch está em GLSL nas transições do kit.

## 8. Render e QA
- Render: `npx hyperframes@0.8.181 render --quality delivery --fps 30`.
  - Com Reflector, Water e bloom, o render calibra o custo e pode baixar os workers.
  - Correr em background com o log em ficheiro, nunca com `| tail`.
- QA (`local-audio/qa.sh`):
  - `ffprobe`: H.264 e AAC, resolução e fps certos.
  - `ebur128`: cerca de -14 LUFS, pico abaixo de -1 dBFS.
  - Frames nas cenas 3D e no meio das transições, extraídos com `select=eq(n\,N)` e verificados com `getextrema()`. Nunca usar `-ss` antes de `-i`.
  - Whisper sobre a mistura completa.

## Versões testadas
- HyperFrames CLI 0.8.181. A imagem `render-hyperframes` do Compose fixa a 0.8.97; o kit não foi testado nessa versão.
- three 0.186.1, postprocessing 6.39.5, troika-three-text 0.53.0, three-custom-shader-material 6.4.0, simplex-noise 4.0.3.
- Kokoro 0.9.4, diffusers 0.35.2 com Stable Audio Open 1.0, whisper.cpp com large-v3-turbo q5_0.
