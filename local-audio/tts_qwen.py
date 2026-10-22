#!/usr/bin/env python3
"""Voz fixa com Qwen3-TTS (Apache-2.0) em modo CLONE a partir de um "voice pack".

Um voice pack e uma pasta FORA do repositorio (activo pessoal), por omissao em
$VOICE_PACKS_DIR/<id>/ (ver local-audio/README.md, seccao "Voz fixa"):
  ref.wav     10-20 s, uma pessoa, sem musica nem eco, 24 kHz mono (outros formatos sao convertidos)
  ref.txt     transcricao EXACTA do ref.wav (palavra por palavra, com a pontuacao falada)
  params.json {"id": "...", "language": "Portuguese", "model": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",   (aceita tambem voice.json)
               "seed": 1234, "temperature": 0.7, "top_p": 0.8, "top_k": 30, "speed": 1.0,
               "lexicon": {"le4ds": "Leads"}}
O prompt de clone (ICL: audio + texto) e calculado uma vez e guardado em prompt-<modelo>.pt na pasta
do pack; a mesma semente por frase da sempre o mesmo audio para o mesmo texto.

Uso:
  python tts_qwen.py --voice <id|pasta> --text "Uma frase." --out frase.wav
  python tts_qwen.py --voice <id|pasta> --script script.json --outdir audio/vo      (mesmo formato do tts_kokoro.py)
  python tts_qwen.py --voice <id|pasta> --serve 8000                               (HTTP: POST /tts {text, out})
Variaveis: VOICE_PACKS_DIR, QWEN_CACHE_DIR (onde guardar o prompt de clone; por omissao a pasta do pack), DEFAULT_VOICE (id usado quando --voice falta), QWEN_MODEL (sobrepoe o modelo do pack;
  ex.: Qwen/Qwen3-TTS-12Hz-0.6B-Base numa VM so com CPU), QWEN_DEVICE (cpu|cuda; o MPS e muito lento), QWEN_DTYPE (float32|bfloat16;
  bfloat16 em CPU reduz a RAM para metade), QWEN_THREADS.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ap = argparse.ArgumentParser()
ap.add_argument("--voice", default=os.environ.get("DEFAULT_VOICE"))
ap.add_argument("--text"); ap.add_argument("--out")
ap.add_argument("--script"); ap.add_argument("--outdir")
ap.add_argument("--serve", type=int)
ap.add_argument("--model", help="sobrepoe voice.json (ex.: Qwen/Qwen3-TTS-12Hz-0.6B-Base)")
a = ap.parse_args()
if not a.voice:
    sys.exit("sem voz: --voice <id> ou DEFAULT_VOICE")

packs = Path(os.environ.get("VOICE_PACKS_DIR", Path.home() / "voice-packs"))
pack = Path(a.voice) if Path(a.voice).is_dir() else packs / a.voice
cfg = json.loads(((pack / "params.json") if (pack / "params.json").exists() else (pack / "voice.json")).read_text())
ref_text = (pack / "ref.txt").read_text().strip()
model_id = a.model or os.environ.get("QWEN_MODEL") or cfg.get("model", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
dev = os.environ.get("QWEN_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
if os.environ.get("QWEN_THREADS"):
    torch.set_num_threads(int(os.environ["QWEN_THREADS"]))
dtype = {"float32": torch.float32, "bfloat16": torch.bfloat16}[os.environ.get("QWEN_DTYPE") or ("bfloat16" if dev == "cuda" else "float32")]
t0 = time.time()
model = Qwen3TTSModel.from_pretrained(model_id, device_map=dev, dtype=dtype)
print(f"modelo {model_id} em {dev} ({time.time() - t0:.1f} s)", file=sys.stderr)

# prompt de clone em cache: depende do audio, do texto e do modelo (muda um, recalcula)
ref = pack / "ref.wav"
key = hashlib.sha1(ref.read_bytes() + ref_text.encode() + model_id.encode()).hexdigest()[:12]
cache_dir = Path(os.environ.get("QWEN_CACHE_DIR") or pack); cache_dir.mkdir(parents=True, exist_ok=True)
cache = cache_dir / f"prompt-{pack.name}-{model_id.rstrip('/').split('/')[-1]}-{key}.pt"
if cache.exists():
    prompt = torch.load(cache, weights_only=False)
else:
    prompt = model.create_voice_clone_prompt(ref_audio=str(ref), ref_text=ref_text, x_vector_only_mode=False)
    torch.save(prompt, cache)
lex = dict(cfg.get("lexicon", {}))
# grafia antiga (pre-AO90) so para o TTS: "faturação" -> "facturação" puxa o [a] aberto do PT-PT; a legenda fica na grafia actual
if cfg.get("grafia_antiga") and (pack / "consoante-muda.json").exists():
    for k, v in json.loads((pack / "consoante-muda.json").read_text()).get("palavras", {}).items():
        lex.setdefault(k, v); lex.setdefault(k[0].upper() + k[1:], v[0].upper() + v[1:])


def norm_key(text):
    """Chave de frase para a memoria de correcoes: minusculas, sem pontuacao, espacos simples."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", text.lower())).strip()


# memoria de correcoes de pronuncia do pack (frase -> semente aprovada); ver pronuncia.py
_corr = {}
if (pack / "correcoes.json").exists():
    _corr = json.loads((pack / "correcoes.json").read_text()).get("frases", {})


def spoken(text):
    for k in sorted(lex, key=len, reverse=True):
        text = re.sub(rf"(?<![\w-]){re.escape(k)}(?![\w-])", lex[k], text)
    return text


LANG = {"pt": "Portuguese", "en": "English", "es": "Spanish", "fr": "French", "de": "German", "it": "Italian"}


def say(text, out, language=None, seed=None):
    # semente: explicita > aprovada na memoria de correcoes (mesmo texto) > a do pack
    c = _corr.get(norm_key(text))
    if seed is None and c and norm_key(c.get("text", text)) == norm_key(text):
        seed = c.get("seed")
    seed = int(seed if seed is not None else cfg.get("seed", 1234))
    torch.manual_seed(seed)
    t = time.time()
    wavs, sr = model.generate_voice_clone(text=spoken(text), language=LANG.get(language or "", language) or cfg.get("language", "Portuguese"), voice_clone_prompt=prompt,
                                          do_sample=True, temperature=cfg.get("temperature", 0.7), top_p=cfg.get("top_p", 0.8), top_k=cfg.get("top_k", 30),
                                          # tecto de tokens (12 por segundo): sem ele uma amostragem que nao fecha gera ate 2048 tokens (~170 s) e prende o CPU
                                          max_new_tokens=int(12 * (len(spoken(text)) / 9 + 3)))
    raw = Path(str(out) + ".raw.wav"); sf.write(raw, np.asarray(wavs[0], dtype=np.float32), sr)
    sp = float(cfg.get("speed", 1.0))
    af = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"
    if abs(sp - 1.0) > 1e-3:
        af += f",atempo={sp}"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", af, "-ar", "48000", "-ac", "1", str(out)], check=True)
    raw.unlink()
    d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)]))
    return {"out": str(out), "duration": d, "seconds": round(time.time() - t, 2), "voice": cfg.get("id", pack.name), "seed": seed}


if a.text:
    print(json.dumps(say(a.text, Path(a.out or "out.wav"))))
elif a.script:
    s = json.loads(Path(a.script).read_text()); out = Path(a.outdir); out.mkdir(parents=True, exist_ok=True)
    lines = [l for sc in s["scenes"] for l in sc["lines"]]   # cada linha: "texto" ou {"text": ..., "seed": ..., "out": ...}
    for i, ln in enumerate(lines):
        ln = ln if isinstance(ln, dict) else {"text": ln}
        print(json.dumps(say(ln["text"], out / ln.get("out", f"t{i:02d}.wav"), seed=ln.get("seed"))), flush=True)
    lines = [l["text"] if isinstance(l, dict) else l for l in lines]
    (out / "lines.json").write_text(json.dumps(lines, ensure_ascii=False, indent=1))
elif a.serve:
    from http.server import BaseHTTPRequestHandler, HTTPServer
    work = Path(os.environ.get("WORK_DIR", "/work"))

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            self._json(200, {"ok": True, "voice": cfg.get("id", pack.name), "model": model_id})

        def do_POST(self):
            try:
                b = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
                out = (work / b["out"]).resolve()
                if work.resolve() not in out.parents or not str(b.get("text", "")).strip():
                    return self._json(400, {"error": "text/out invalidos"})
                self._json(200, say(str(b["text"])[:2000], out, b.get("language")))
            except Exception as e:  # noqa: BLE001
                self._json(500, {"error": str(e)[:400]})

        def _json(self, code, obj):
            body = json.dumps(obj).encode(); self.send_response(code)
            self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body)

        def log_message(self, *x):
            pass
    HTTPServer(("0.0.0.0", a.serve), H).serve_forever()
