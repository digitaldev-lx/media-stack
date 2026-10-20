#!/usr/bin/env python3
"""Mistura final: voz (por frase, nos tempos da timeline) + musica (2 segmentos Stable Audio, A repetido
por compassos ate ao drop, B a partir do drop) + SFX sintetizados (numpy) -> mix.wav a -14 LUFS.

Uso:  python mix.py <timeline.json> <vo_dir> <segA.wav> <segB.wav> <saida/mix.wav>
          [--drop-scene NOME] [--transitions transitions.json] [--segB-beat 0.488] [--music-db -13]
transitions.json: [{"at": 6.63, "type": "zoom", "d": 0.8}, ...]; type "flash" = drop (riser + impacto).

Cadeia (o que funcionou para a voz se ouvir com clareza, validado com Whisper sobre a mistura completa):
  voz:    highpass 80 Hz -> compressor 3:1 -> +3 dB a 3 kHz -> loudnorm -15 LUFS
  musica: -13 dB (o Stable Audio sai a ~-6 LUFS) -> corte de 5 dB a 2,2 kHz e 3 dB a 900 Hz
          -> sidechaincompress pela voz (ratio 12, release 380 ms)
  final:  amix -> alimiter -> loudnorm I=-14 TP=-1.5
"""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

import sfx as S

ap = argparse.ArgumentParser()
for a in ["timeline", "vo", "segA", "segB", "out"]:
    ap.add_argument(a)
ap.add_argument("--drop-scene"); ap.add_argument("--transitions")
ap.add_argument("--segB-beat", type=float, default=None); ap.add_argument("--music-db", type=float, default=-13)
o = ap.parse_args()
SR = 48000
tl = json.loads(Path(o.timeline).read_text()); T = tl["total"]; N = int(T * SR)
tr = json.loads(Path(o.transitions).read_text()) if o.transitions else []
DROP = next((s["start"] for s in tl["scenes"] if s["name"] == o.drop_scene), None)
tmp = Path(o.out).parent


def load(p):
    q = tmp / "_l.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(p), "-ar", str(SR), "-ac", "2", str(q)], check=True)
    x, _ = sf.read(q); q.unlink(); return x


def fade(x, n=480):
    x = x.copy(); r = np.linspace(0, 1, n)[:, None]; x[:n] *= r; x[-n:] *= r[::-1]; return x


# ---- voz
voice = np.zeros((N, 2))
for sc in tl["scenes"]:
    for l in sc["lines"]:
        x = load(Path(o.vo) / f"t{l['i']:02d}.wav"); a = int(l["start"] * SR); voice[a:a + len(x)] += x[: N - a]
sf.write(tmp / "voice_raw.wav", voice, SR)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp / "voice_raw.wav"), "-af",
                "highpass=f=80,acompressor=threshold=-22dB:ratio=3:attack=4:release=90:makeup=3,equalizer=f=3000:t=q:w=1.2:g=3,loudnorm=I=-15:TP=-1.5:LRA=9",
                "-ar", str(SR), str(tmp / "voice.wav")], check=True)
# ---- musica
A, B = load(o.segA), load(o.segB)
B0, BP = tl["beat0"], tl["beat"]; bar = 4 * BP
music = np.zeros((N, 2))
if DROP is not None:
    k1 = int((min(40.0, len(A) / SR - 3) - B0) // bar); cut1 = B0 + k1 * bar
    need = DROP - cut1
    if need > 0:
        loop0 = cut1 - round(need / bar) * bar
        mA = np.concatenate([fade(A[: int(cut1 * SR)]), fade(A[int(loop0 * SR): int((loop0 + need) * SR)])])[: int(DROP * SR)]
    else:
        mA = fade(A[: int(DROP * SR)])
    L = int(bar * SR); tail = mA[-L:].copy()
    for c in range(16):  # passa-alto a subir no ultimo compasso antes do drop (tensao)
        a, b = c * L // 16, (c + 1) * L // 16
        tail[a:b] = sosfilt(butter(2, 60 + (c / 16) ** 2 * 2500, "highpass", fs=SR, output="sos"), tail[a:b], axis=0) * (1 - 0.5 * c / 16)
    mA[-L:] = tail
    sb = o.segB_beat if o.segB_beat is not None else 0.0
    mB = fade(B[int(sb * SR):])
    music[: len(mA)] += mA[:N]; d = int(DROP * SR); music[d: d + len(mB)] += mB[: N - d]
else:
    music[: min(N, len(A))] += fade(A[:N])
fo = int(2.4 * SR); music[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
music *= 10 ** (o.music_db / 20)
sf.write(tmp / "music_bed.wav", music, SR)
# ---- sfx
rng = np.random.default_rng(7); sfx = np.zeros((N, 2))
for t in tr:
    if t["type"] == "flash":
        S.put(sfx, S.riser(rng, bar, SR), t["at"] - bar, SR, 0.32); S.put(sfx, S.boom(rng, 1.6, SR), t["at"], SR, 0.9)
    elif t["type"] == "glitch":
        S.put(sfx, S.glitch(rng, 0.35, SR), t["at"] - 0.2, SR, 0.25); S.put(sfx, S.whoosh(rng, 0.6, SR, 600, 6000), t["at"] - 0.3, SR, 0.22)
    else:
        S.put(sfx, S.whoosh(rng, 0.9 if t.get("d", 0.7) > 0.6 else 0.6, SR), t["at"] - 0.5, SR, 0.28, pan=float(rng.uniform(-0.4, 0.4)))
S.put(sfx, S.boom(rng, 2.2, SR), tl["scenes"][-1]["start"] + 0.45, SR, 0.6)
sf.write(tmp / "sfx.wav", sfx, SR)
# ---- mistura
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp / "music_bed.wav"), "-i", str(tmp / "voice.wav"), "-i", str(tmp / "sfx.wav"), "-filter_complex",
                "[1:a]asplit=2[vk][vm];[0:a]equalizer=f=2200:t=q:w=1.0:g=-5,equalizer=f=900:t=q:w=1.0:g=-3[meq];"
                "[meq][vk]sidechaincompress=threshold=0.02:ratio=12:attack=10:release=380:makeup=1[duck];"
                "[duck][vm][2:a]amix=inputs=3:weights='1 1 1':normalize=0,alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=11[out]",
                "-map", "[out]", "-ar", str(SR), "-ac", "2", "-t", f"{T:.3f}", "-c:a", "pcm_s16le", o.out], check=True)
print("ok", o.out, "total", T, "drop", DROP)
