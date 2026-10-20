#!/usr/bin/env python3
"""Timestamps palavra a palavra: whisper.cpp por FRASE (-ml 1 -sow), re-ancorados ao inicio de cada frase.

Uso:  python align_words.py <timeline.json> <vo_dir> <saida/words.json>
Precisa de `whisper-cli` (whisper.cpp) no PATH e WHISPER_MODEL=<caminho para ggml-*.bin>.
Quando o Whisper parte uma palavra (ex.: "FrankenPHP" -> "Frank and PHP") junta tokens ate
cobrir o tamanho da palavra do guiao. ALIAS resolve as palavras ditas de outra forma.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

tl = json.loads(Path(sys.argv[1]).read_text())
vo = Path(sys.argv[2])
model = os.environ.get("WHISPER_MODEL")
if not model:
    sys.exit("definir WHISPER_MODEL=/caminho/ggml-large-v3-turbo-q5_0.bin")
ALIAS = {"le4ds.": "leads", "php-fpm": "phpfpm", "nginx": "enginex", "three.js": "3js"}
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())  # noqa: E731
words = []
tmp = Path(tempfile.mkdtemp())
for sc in tl["scenes"]:
    for l in sc["lines"]:
        i, st, du = l["i"], l["start"], l["dur"]
        w16 = tmp / f"w{i:02d}.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(vo / f"t{i:02d}.wav"), "-af", "adelay=300,apad=pad_dur=0.5", "-ar", "16000", "-ac", "1", str(w16)], check=True)
        subprocess.run(["whisper-cli", "-m", model, "-l", "en", "-f", str(w16), "-ml", "1", "-sow", "-oj", "-of", str(tmp / f"w{i:02d}")], check=True, capture_output=True)
        segs = json.loads((tmp / f"w{i:02d}.json").read_text())["transcription"]
        ws = [(s["offsets"]["from"] / 1000 - 0.3, s["offsets"]["to"] / 1000 - 0.3, s["text"].strip()) for s in segs if norm(s["text"])]
        target = l["text"].split()
        if len(ws) == len(target):
            pairs = [(a, b, w) for (a, b, _), w in zip(ws, target)]
        else:
            pairs, k = [], 0
            for w in target:
                need = len(norm(ALIAS.get(w.lower(), w)))
                a = ws[k][0] if k < len(ws) else du
                b, acc = a, ""
                while k < len(ws) and len(acc) < need:
                    acc += norm(ws[k][2]); b = ws[k][1]; k += 1
                pairs.append((a, b, w))
        for a, b, w in pairs:
            words.append({"line": i, "w": w, "t0": round(st + max(0, a), 3), "t1": round(st + min(du, max(a, b)), 3)})
Path(sys.argv[3]).write_text(json.dumps(words, ensure_ascii=False))
print(len(words), "palavras")
