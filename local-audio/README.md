# local-audio: voz, música, SFX e mistura 100% locais

Ferramentas de linha de comando para produzir o áudio de um vídeo sem serviços pagos. São a alternativa local à voz fal.ai Eleven v3 do `gateway`, que continua a ser o caminho por omissão na API. Correm fora do Docker Compose, numa máquina de trabalho (testado em macOS Apple Silicon com MPS; em Linux corre em CPU/CUDA).

| Ficheiro | Faz |
|---|---|
| `tts_kokoro.py` | Voz Kokoro-82M, uma frase por ficheiro, com léxico de pronúncias e silêncio aparado |
| `pronuncia.py` | Revisão de **homógrafos** (copia/cópia, acordo, controlo...) para a voz fixa: detecta, gera variantes (sementes + reformulações), pasta de revisão com mp3 e índice, grava a escolha na memória do pack |
| `tts_qwen.py` | **Voz fixa** (voice pack) com Qwen3-TTS em modo clone; CLI, lote (`--script`) ou servidor HTTP (`--serve`, usado pelo `tts-qwen` do Compose) |
| `music_stableaudio.py` | Música com Stable Audio Open 1.0 (até 47 s por geração) |
| `beats.py` | BPM e fase da 1.ª batida (para cortar cenas no beat) |
| `layout.py` | Timeline: cenas no beat, a cena do drop num tempo forte |
| `align_words.py` | Timestamps palavra a palavra com whisper.cpp, frase a frase |
| `sfx.py` | Whoosh, riser, impacto, glitch e tick sintetizados em numpy (sem samples) |
| `mix.py` | Voz + música (A repetida por compassos até ao drop, B depois) + SFX, ducking, -14 LUFS |
| `qa.sh` | ffprobe, loudness, frames com extremos de pixel, Whisper sobre a mistura completa |

## Instalar

```bash
# voz (Python 3.12)
python3.12 -m venv .venvs/kokoro && .venvs/kokoro/bin/pip install -r local-audio/requirements-kokoro.txt
.venvs/kokoro/bin/pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
# música + mistura + QA (Python 3.11)
python3.11 -m venv .venvs/audio && .venvs/audio/bin/pip install -r local-audio/requirements-audio.txt
# whisper.cpp (macOS: brew install whisper-cpp) e ffmpeg
brew install whisper-cpp ffmpeg     # ou compilar o whisper.cpp em Linux
```

`.venvs/` está no `.gitignore`.

### Modelos (nunca entram no repositório)

| Modelo | Tamanho | Licença | De onde |
|---|---|---|---|
| Kokoro-82M (`hexgrad/Kokoro-82M`) | ~330 MB | Apache-2.0 | Hugging Face. Descarrega sozinho na 1.ª execução para `~/.cache/huggingface` |
| Stable Audio Open 1.0 (`stabilityai/stable-audio-open-1.0`) | ~4,5 GB | Stability AI Community License | Hugging Face. **Gated**: aceitar a licença na página do modelo e `huggingface-cli login` com um token read |
| whisper.cpp `ggml-large-v3-turbo-q5_0.bin` | ~550 MB | MIT | `huggingface.co/ggerganov/whisper.cpp`. Apontar `WHISPER_MODEL=/caminho/ggml-large-v3-turbo-q5_0.bin` |

### Licenças e porque não o MusicGen
- **Stable Audio Open 1.0:** a Community License permite uso comercial a organizações com receita anual abaixo de 1 M USD. Acima disso é preciso a licença Enterprise. Confirme os termos actuais antes de publicar.
- **MusicGen (Meta/audiocraft): NÃO usar para material publicável.** Os pesos são CC-BY-NC 4.0 (não comercial). Serve só para testes internos.
- **Kokoro:** Apache-2.0, serve para uso comercial.
  - As vozes `say` do macOS (ex.: Joana) são "personal, non-commercial" na licença da Apple.
  - O Piper do `tts-local` é GPL-3.0 (ver o README principal).
- **SFX:** gerados por código, sem samples e sem licença de terceiros.

### Arestas conhecidas
- **Kokoro + espeak-ng (macOS):** algumas builds do `espeakng_loader` trazem o caminho dos dados do espeak-ng gravado com o caminho da máquina de build. Se aparecer `espeak-ng-data` em falta, criar esse caminho e copiar para lá a pasta `espeak-ng-data` que vem no próprio pacote (precisa de sudo).
- **Stable Audio no MPS:** o `BrownianTreeNoiseSampler` do torchsde entra em recursão infinita. O `music_stableaudio.py` troca-o por ruído gaussiano com semente. Fixar `huggingface_hub<1.0` e `diffusers<0.36`.
- **Saída do Stable Audio:** sai a cerca de -6 LUFS, muito quente. O `mix.py` desce 13 dB antes do ducking.
- **Tempo da música:** prompt com "120 BPM", mas medir sempre com `beats.py`. A fase da 1.ª batida varia por geração.

## Pronúncias (léxico do `script.json`)

O texto da linha é o que aparece nas legendas. O `lexicon` muda só o que é dito. Valores testados com Kokoro `am_michael` e confirmados com Whisper sobre a **mistura completa**, não só a frase isolada:

| Escrito | Dito (lexicon) | Nota |
|---|---|---|
| `le4ds` | `Leads` | |
| `shadcn` | `Shad C N` | |
| `DigitalDev.` | `Digital [Dev](/dˈɛv/).` | Na mistura completa o Whisper ouvia "Digital Dad". O fonema explícito mais `speed_overrides` a 0,85 nessa linha resolve |
| `Horizon` | `Laravel Horizon runs the queues.` | Pelo contexto: "Horizon runs it on queues" saía como "Trific runs" na mistura |
| `PHP-FPM` | `P H P, F P M` | |
| `Nginx` | `Engine X` | |
| `Three.js` | `Three J S` | |
| `R2` | `R two` | |
| `HyperFrames` | `Hyper Frames` | |
| `WebGL` | `Web G L` | |
| `Excel` | `Écsel` | Sem isto o Qwen lia "Ixchel" (Whisper) |

Regra de escrita: **uma ideia por frase**. A voz é sintética e as frases com orações encaixadas soam comprimidas.

## Mistura que funcionou

`mix.py` (alvo final **-14 LUFS**, pico ≤ -1,5 dBTP):
- **Voz:** highpass 80 Hz, compressor 3:1, +3 dB a 3 kHz, loudnorm -15.
- **Música:** -13 dB, cortes de presença (-5 dB a 2,2 kHz e -3 dB a 900 Hz), `sidechaincompress` pela voz (ratio 12, release 380 ms).
- **Drop:** passa-alto a subir no último compasso antes do drop, riser e impacto, segmento B no tempo forte.
- **Final:** `amix`, limiter, `loudnorm`.

A validação obrigatória é o Whisper sobre a mistura completa (`qa.sh` com `WHISPER_MODEL`). Os nomes próprios têm de sair certos.

O Whisper em contexto longo pode ainda engolir palavras curtas em início de frase (ex.: "One image"). Confirme essas numa janela curta antes de mexer na mistura.

## Voz fixa (voice pack + Qwen3-TTS)

Para todos os vídeos saírem com **a mesma voz** sem ninguém a escolher, a voz não é "desenhada" a cada chamada. Fica fixa num *voice pack*, sempre usado em modo clone (ICL: áudio + transcrição) com a mesma semente e os mesmos parâmetros.

**Onde vive:** fora de qualquer repositório, porque um voice pack é um activo pessoal. Fica numa pasta à escolha, apontada por `VOICE_PACKS_DIR` (local) ou `VOICE_PACKS_HOST_DIR` (Compose). O `.gitignore` deste repo bloqueia `voices/` e `*.wav`.

```
<VOICE_PACKS_DIR>/<id>/
  ref.wav       10-20 s de fala fluida de UMA pessoa: sem música, sem eco, sem "hã" nem palavras cortadas
  ref.txt       transcrição EXACTA do ref.wav (números por extenso, como são ditos)
  params.json   {"id": "<id>", "language": "Portuguese", "model": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
                 "seed": 1234, "temperature": 0.7, "top_p": 0.8, "top_k": 30, "speed": 1.0, "lexicon": {...}}
  source/       (opcional) o áudio original de onde saiu a referência
```

**Como montar um pack a partir de uma gravação** (ver também o QA abaixo):
1. Obter **consentimento escrito** da pessoa cuja voz é clonada. Sem isso, não se faz.
2. Transcrever a gravação com timestamps (`whisper-cli -ml 1 -sow -oj`). Escolher 2 a 3 excertos de 10–20 s sem hesitações nem cortes.
   - O Whisper "limpa" os "hã" e as repetições. Confirme com uma 2.ª passagem literal (`--prompt "Hã, hm... transcrição literal"`) e pelas pausas > 0,35 s entre palavras.
3. Cortar cada excerto: `ffmpeg -ss A -to B -af "highpass=f=70,silenceremove...,loudnorm=I=-18:TP=-2" -ar 24000 -ac 1 ref.wav`.
4. Gerar as mesmas frases de teste com cada candidato e escolher por estes critérios:
   - (a) o Whisper transcreve certo;
   - (b) semelhança de timbre (cosseno de embeddings de orador contra um trecho da mesma pessoa que não seja a referência);
   - (c) o ouvido de quem é dono da voz.
5. Fixar `seed` e parâmetros. A mesma semente e o mesmo texto dão exactamente o mesmo áudio (verificado byte a byte).

**Usar:**
```bash
export VOICE_PACKS_DIR=/caminho/voice-packs DEFAULT_VOICE=<id>
.venvs/qwen/bin/python local-audio/tts_qwen.py --text "Uma frase." --out frase.wav
.venvs/qwen/bin/python local-audio/tts_qwen.py --script audio/script.json --outdir audio/vo   # template: "engine": "qwen"
```

Instalação: `uv venv -p 3.12 .venvs/qwen && uv pip install -p .venvs/qwen/bin/python qwen-tts==0.1.1 torch torchaudio`, mais `ffmpeg`. O `sox` é opcional: sem ele aparece um aviso inofensivo.

**Modelo, licença e velocidade.** Qwen3-TTS, pesos `Qwen/Qwen3-TTS-12Hz-0.6B-Base` e `-1.7B-Base`, **Apache-2.0**, 10 línguas incluindo "Portuguese" (sem separar PT-PT de PT-BR). Medido num Mac M1 Pro, só CPU (o MPS é dezenas de vezes mais lento com este modelo), em frases de 2–4 s:

| Modelo | Tempo por frase | Factor sobre o tempo real | RAM |
|---|---|---|---|
| 0.6B | ~10–20 s | ~5–6× | ~2,5 GB |
| 1.7B | ~30–100 s | ~15–25× | ~7 GB |

Com a máquina livre, o 1.7B leva 20 a 25 s por frase. Medido em fp32, o 0.6B chega a ~5,8 GB de pico.

#### Que modelo usar (actualizado 2026-10-22)

- **1.7B por omissão no pack de produção.** O timbre é praticamente igual nos dois: 0,667 no 1.7B contra 0,650 no 0.6B. A diferença está no sotaque. Com a mesma referência PT-PT, o 1.7B deixa de palatalizar o /d/ e o /t/ antes de [i] (o "pedjido", "sítjio"), e o 0.6B não. Ver o detector `sotaque.py` mais abaixo. Se o pack tiver `"grafia_antiga": true`, o "faturação" sai com o "a" aberto. O 0.6B pode ficar no pack como `model_lite`, só para rascunhos rápidos, nunca no vídeo final.
- **Um só modelo por pack, em todos os vídeos.** O 0.6B e o 1.7B não soam iguais, e uma semente escolhida num não dá o mesmo áudio no outro. Ao mudar o modelo de um pack:
  - as sementes aprovadas na revisão de pronúncia (`correcoes.json`) têm de voltar a ser validadas com `sotaque.py --gate`;
  - o `prompt-*.pt` em cache é por modelo, por isso o do novo modelo é gerado na primeira chamada.
- **Onde corre:**
  - **Nativo (fora do Docker), em CPU, numa máquina com ≥ 16 GB.** Testado num Mac M1 Pro com 16 GB: cabe, se não houver outras cargas pesadas em paralelo.
  - **No MPS, não.** É dezenas de vezes mais lento com este modelo.
  - **Num trabalho de voz de cada vez.** Com a máquina carregada (dois vídeos em paralelo, ou um render 3D ao mesmo tempo), o tempo por frase passa de segundos para minutos, e um lote pode levar horas.
  - **Tempo de referência:** num reel de ~30 s, com a revisão por blocos e várias sementes por bloco, conte com 10 a 20 minutos só para a voz. O render HyperFrames 2D leva ~1 min.
- **Docker (`tts-qwen`, perfil `qwen`):**
  - **Precisa de ~7 GB de RAM para o 1.7B.** Um Docker Desktop com ~4 GB não chega nem para o 0.6B: o contentor é morto por falta de memória (exit 137).
  - **Por isso o `docker-compose.yml` e o `.env.example` trazem `QWEN_MODEL` com o 0.6B por omissão.** Isto **quebra a regra de um só modelo**: um vídeo pela API sai com uma voz diferente de um feito em modo nativo com o mesmo pack.
  - **Numa VM com RAM suficiente, ponha no `.env`:** `QWEN_MODEL=/models/qwen/Qwen3-TTS-12Hz-1.7B-Base` (descarregar com `docker compose --profile tools run --rm models qwen_tts_17b`) e `QWEN_MEM` ≥ 8g. Assim a API e o modo nativo ficam iguais.
- **Muito volume** (várias línguas, lotes diários): sem GPU, o 1.7B fica lento. Uma GPU alugada à hora (`QWEN_DEVICE=cuda`) gera a mesma voz em segundos por frase. Validar sempre com `sotaque.py --gate` antes de mudar de máquina.

**Sotaque PT-PT.** A referência manda. Com uma referência PT-PT, o clone mantém marcas europeias mensuráveis: na fracção de fricativas tipo /ʃ/ ("s" final e antes de consoante), o clone fica a 0,42–0,70. Para comparação, uma voz PT-PT real dá 0,44–0,63 e uma voz pt-BR dá 0,16. Isto é um indicador, não uma prova. A validação final é o ouvido. Com uma referência brasileira, o resultado sai brasileiro.

**Alternativa: Space do Hugging Face.** Fica só como fallback manual, com o `HF_TOKEN` apenas no ambiente. Manda o áudio para fora, dorme e tem quotas, por isso não serve em produção.

### Outros modelos avaliados (comercial + PT-PT + CPU)

| Modelo | Licença | PT-PT | CPU | Veredicto |
|---|---|---|---|---|
| **Qwen3-TTS 0.6B/1.7B Base** | Apache-2.0 | "Portuguese"; o sotaque vem da referência | sim (0.6B ~5× tempo real) | **escolhido** |
| Zonos v0.1 transformer (Zyphra) | Apache-2.0 | separa `pt` (europeu, via eSpeak) de `pt-br` | ~10 min/frase em CPU; o hybrid exige CUDA | testado: mais palatalizacao que o Qwen 1.7B e menos parecido; descartado |
| Chatterbox Multilingual (Resemble) | MIT | "pt" sem variante (provavelmente BR) | lento em CPU (0,5B) | não testado |
| Piper `pt_PT-tugao-medium` | MIT (vozes) + GPL-3.0 (piper1) | PT-PT real | muito rápido | já é o fallback do Compose; não clona |
| Kokoro-82M | Apache-2.0 | só pt-BR (`pf_dora`) | rápido | não serve para PT-PT |
| XTTS-v2 | CPML (não comercial) | — | — | excluído |
| F5-TTS, MMS-TTS, OuteTTS, Fish/OpenAudio | CC-BY-NC / NC-SA | — | — | excluídos (não comercial) |

### Revisão de pronúncia (homógrafos)

Há palavras que se escrevem igual e se dizem de maneira diferente: "copia" (verbo) e "cópia" (nome), "o acordo" e "eu acordo", "o controlo" e "eu controlo". O modelo acerta quase sempre pelo contexto, mas nem sempre. Forçar acentos na grafia ("copía", "copi-a") **não é fiável** e piora o resultado. O que funciona é escolher entre variantes geradas:
- sementes alternativas;
- reformulações que desambiguam pelo contexto ("copia" passa a "está a copiar").

- **Dados no pack, fora do repo:**
  - `homografos.json`: lista de risco, com as leituras e as reformulações possíveis;
  - `correcoes.json`: memória (frase → texto e semente aprovados; palavra → reformulação preferida).
- **Fluxo:**
  ```bash
  python local-audio/pronuncia.py check  --pack <pack> --lines reel.json      # frases com homógrafos, e se já estão aprovadas
  python local-audio/pronuncia.py review --pack <pack> --lines reel.json --name <video> --py .venvs/qwen/bin/python
  #   -> ~/Downloads/<video>-revisao-pronuncia/: um mp3 por variante, indice.txt, escolhas.json
  #   o dono da voz ouve e escreve a letra escolhida em "escolha"
  python local-audio/pronuncia.py apply  --pack <pack> --review ~/Downloads/<video>-revisao-pronuncia
  ```
- **Uso no render:**
  - o `tts_qwen.py` aplica sozinho a semente aprovada quando o texto coincide;
  - quem gera o guião (por exemplo, um pipeline de reels) deve trocar o texto pela reformulação aprovada **antes** de compor, para a legenda acompanhar o que é dito.
- **Custo:** cerca de 15 s por variante no 0.6B em CPU, mais ~25 s a carregar o modelo. Até 5 variantes por frase sinalizada.


## Detector de sotaque (`sotaque.py`)

Mede tracos pt-BR numa voz que devia ser PT-PT, alinhando o texto (eSpeak `pt`, europeu) ao audio com
`facebook/wav2vec2-xlsr-53-espeak-cv-ft` (Apache-2.0) e lendo a probabilidade de cada fonema esperado:

| metrica | o que mede | limite |
|---|---|---|
| `palat` | `[dʒ tʃ]` nos d/t antes de `[i j]` (pedido, sitio, dia, partida) | <= 0.05 por palavra |
| `lenis` | `[ð]` nos d entre vogais ("cada" = `[ˈkaðɐ]`) | >= 0.15 em media |
| `muda_ab` | `[a]` aberto nas palavras com consoante muda historica (fatura, acao, atual) | >= 0.5 |
| `sil_s` | silabas por segundo de fala, sem pausas | 5.6 a 7.0 |

```bash
.venvs/spk/bin/python local-audio/sotaque.py --pairs pares.json --gate   # sai com 2 se nao passar
```

A versao anterior contava so o fonema vencedor e nao via a africacao parcial de um clone; esta mede a massa de
probabilidade. Os limites foram calibrados contra voz real PT-PT, uma voz PT-PT sintetica e uma pt-BR.
O pack de voz pode ter `consoante-muda.json` e `"grafia_antiga": true` nos params: o TTS recebe a grafia
pre-AO90 ("facturação") e a legenda fica na actual.
