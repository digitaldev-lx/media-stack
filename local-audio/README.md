# local-audio: voz, música, SFX e mistura 100% locais

Ferramentas de linha de comando para produzir o áudio de um vídeo sem serviços pagos. São a alternativa local à voz fal.ai Eleven v3 do `gateway`, que continua a ser o caminho por omissão na API. Correm fora do Docker Compose, numa máquina de trabalho (testado em macOS Apple Silicon com MPS; em Linux corre em CPU/CUDA).

| Ficheiro | Faz |
|---|---|
| `tts_kokoro.py` | Voz Kokoro-82M, uma frase por ficheiro, com léxico de pronúncias e silêncio aparado |
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

Regra de escrita: **uma ideia por frase**. A voz é sintética e as frases com orações encaixadas soam comprimidas.

## Mistura que funcionou

`mix.py` (alvo final **-14 LUFS**, pico ≤ -1,5 dBTP):
- **Voz:** highpass 80 Hz, compressor 3:1, +3 dB a 3 kHz, loudnorm -15.
- **Música:** -13 dB, cortes de presença (-5 dB a 2,2 kHz e -3 dB a 900 Hz), `sidechaincompress` pela voz (ratio 12, release 380 ms).
- **Drop:** passa-alto a subir no último compasso antes do drop, riser e impacto, segmento B no tempo forte.
- **Final:** `amix`, limiter, `loudnorm`.

A validação obrigatória é o Whisper sobre a mistura completa (`qa.sh` com `WHISPER_MODEL`). Os nomes próprios têm de sair certos.

O Whisper em contexto longo pode ainda engolir palavras curtas em início de frase (ex.: "One image"). Confirme essas numa janela curta antes de mexer na mistura.
