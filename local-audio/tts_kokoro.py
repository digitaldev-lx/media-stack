#!/usr/bin/env python3
"""Voz local com Kokoro-82M (Apache-2.0). Uma frase por ficheiro, silencio aparado.

Uso:  python tts_kokoro.py <script.json> <saida_dir>
script.json:
  {"voice": "am_michael", "lang": "a", "speed": 0.97,
   "lexicon": {"le4ds": "Leads", "DigitalDev": "Digital [Dev](/dˈɛv/)"},
   "scenes": [{"name": "hook", "lines": ["Everything you are watching is code."]}, ...]}

O texto das linhas e o que aparece nas legendas; o "lexicon" so muda o que e DITO
(substituicao literal, palavra a palavra, antes de enviar ao Kokoro). Ver README: pronuncias.
Escreve <saida>/tNN.wav (48 kHz mono, sem silencio nas pontas) e <saida>/lines.json.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

cfg = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
lines = [l for s in cfg["scenes"] for l in s["lines"]]
lex = cfg.get("lexicon", {})


def spoken(text: str) -> str:
    for k in sorted(lex, key=len, reverse=True):
        text = re.sub(rf"(?<![\w-]){re.escape(k)}(?![\w-])", lex[k], text)
    return text.replace('"', "")


pipe = KPipeline(lang_code=cfg.get("lang", "a"), repo_id="hexgrad/Kokoro-82M")
trim = ("silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
        "silenceremove=start_periods=1:start_threshold=-45dB,areverse")
for i, text in enumerate(lines):
    speed = cfg.get("speed_overrides", {}).get(str(i), cfg.get("speed", 1.0))
    parts = [r.audio.numpy() for r in pipe(spoken(text), voice=cfg.get("voice", "am_michael"), speed=speed)]
    raw = out / f"k{i:02d}.wav"
    sf.write(raw, np.concatenate(parts), 24000)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", trim, "-ar", "48000", "-ac", "1", str(out / f"t{i:02d}.wav")], check=True)
    raw.unlink()
    print(f"{i:02d}", spoken(text))
(out / "lines.json").write_text(json.dumps(lines, ensure_ascii=False, indent=1))
