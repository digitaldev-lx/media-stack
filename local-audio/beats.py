#!/usr/bin/env python3
"""Mede BPM e a fase da 1.a batida de uma faixa (fluxo espectral + autocorrelacao).

Uso:  python beats.py musica.wav   ->  {"bpm": 120.19, "beat": 0.4992, "first_beat": 0.139}
"""
import json
import sys

import numpy as np
import soundfile as sf

x, sr = sf.read(sys.argv[1])
x = x.mean(1) if x.ndim > 1 else x
hop, n = 512, 2048
frames = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * np.hanning(n)
S = np.log1p(np.abs(np.fft.rfft(frames, axis=1)))
flux = np.maximum(0, np.diff(S, axis=0)).sum(1)
flux = (flux - flux.mean()) / (flux.std() + 1e-9)
fps = sr / hop
ac = np.correlate(flux, flux, "full")[len(flux) - 1:]
lags = np.arange(len(ac)) / fps
bpms = 60 / np.maximum(lags[1:], 1e-9)
m = (bpms > 70) & (bpms < 180)
bpm = float(bpms[m][np.argmax(ac[1:][m])])
period = 60 / bpm * fps
score = [flux[np.round(np.arange(o, len(flux), period)).astype(int)].sum() for o in range(int(period))]
first = float(np.argmax(score) / fps)
print(json.dumps({"bpm": round(bpm, 2), "beat": round(60 / bpm, 4), "first_beat": round(first, 3)}))
