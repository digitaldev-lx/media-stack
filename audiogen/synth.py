"""Sintese procedural (numpy, zero modelos, zero licenca): musica de fundo e SFX. CPU, quase instantaneo."""
import hashlib
import numpy as np

SR = 44100


def _rng(key: str, seed: int | None):
    h = int(hashlib.sha256(f"{key}|{seed}".encode()).hexdigest()[:8], 16)
    return np.random.default_rng(h)


def _lp(x, k):  # lowpass por media exponencial (k em amostras)
    ker = np.exp(-np.arange(int(k * 6) + 1) / k)
    ker /= ker.sum()
    return np.convolve(x, ker, mode="same")


def _env(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, max(na, 1))
    e[-nr:] = np.minimum(e[-nr:], np.linspace(1, 0, max(nr, 1)))
    return e


def _stereo(m):
    m = np.clip(m, -1, 1).astype(np.float32)
    return np.stack([m, m], axis=1)


# ---------------- SFX
def sfx(kind: str, seed: int | None = None, dur: float | None = None):
    r = _rng("sfx" + kind, seed)
    t = lambda d: np.arange(int(d * SR)) / SR
    if kind == "whoosh":
        d = dur or 0.7
        n = r.standard_normal(int(d * SR))
        sw = _lp(n, 6) * np.linspace(0, 1, len(n)) ** 2 + _lp(n, 40) * np.linspace(1, 0, len(n))
        x = sw * np.sin(np.pi * np.linspace(0, 1, len(n))) ** 1.5
        x = x / (np.abs(x).max() + 1e-9) * 0.7
    elif kind == "click":
        d = dur or 0.08
        x = (r.standard_normal(int(d * SR)) * np.exp(-t(d) * 90)) * 0.6
        x = x - _lp(x, 30)
    elif kind == "pop":
        d = dur or 0.18
        f = 520 * np.exp(-t(d) * 18) + 120
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t(d) * 22) * 0.7
    elif kind == "riser":
        d = dur or 1.6
        f = np.linspace(150, 1800, int(d * SR))
        x = (np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + _lp(r.standard_normal(len(f)), 4) * 0.4) * np.linspace(0, 1, len(f)) ** 2
    elif kind == "impact":
        d = dur or 1.0
        f = 90 * np.exp(-t(d) * 5) + 35
        x = (np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.9 + _lp(r.standard_normal(int(d * SR)), 12) * 0.4 * np.exp(-t(d) * 9)) * np.exp(-t(d) * 3.5)
    elif kind == "check":
        d = dur or 0.35
        tt = t(d)
        x = (np.sin(2 * np.pi * 880 * tt) * (tt < 0.12) + np.sin(2 * np.pi * 1320 * tt) * (tt >= 0.08)) * np.exp(-tt * 9) * 0.5
    elif kind == "glitch":
        d = dur or 0.35
        n = r.standard_normal(int(d * SR))
        gate = (np.sin(2 * np.pi * 28 * t(d)) > 0.2).astype(float)
        x = np.round(n * gate * 4) / 4 * 0.35
    else:
        raise ValueError(f"sfx desconhecido: {kind}")
    x = x * _env(len(x), 0.003, min(0.05, len(x) / SR / 2))
    return _stereo(x)


SFX_KINDS = ["whoosh", "click", "pop", "riser", "impact", "check", "glitch"]


# ---------------- musica
STYLES = {
    "calm": ([57, 53, 48, 55], 72, 0.0), "corporate": ([57, 53, 48, 55], 100, 0.5),
    "tech": ([52, 48, 55, 50], 116, 0.7), "dark": ([45, 41, 43, 40], 84, 0.3),
    "upbeat": ([48, 55, 57, 53], 124, 0.8),
}


def _style(prompt: str):
    p = prompt.lower()
    for k, v in STYLES.items():
        if k in p:
            return v
    return STYLES["corporate"]


def music(prompt: str, duration: float, seed: int | None = None):
    r = _rng("music" + prompt, seed)
    roots, bpm, pulse = _style(prompt)
    n = int(duration * SR)
    x = np.zeros(n)
    beat = 60.0 / bpm
    bar = beat * 4
    f = lambda m: 440.0 * 2 ** ((m - 69) / 12)
    nbars = int(duration / bar) + 1
    for b in range(nbars):
        root = roots[b % len(roots)]
        s, e = int(b * bar * SR), min(n, int((b + 1) * bar * SR + 0.4 * SR))
        if s >= n:
            break
        tt = np.arange(e - s) / SR
        pad = np.zeros(e - s)
        for iv in (0, 7, 12, 16):  # acorde aberto maior/menor suave
            for det in (-0.003, 0.003):
                pad += np.sin(2 * np.pi * f(root + iv) * (1 + det) * tt) * 0.5
        pad *= _env(len(pad), 0.5, 0.5) * 0.12
        x[s:e] += pad
        if pulse > 0:  # arpejo pluck
            for i in range(8):
                ps = s + int(i * beat / 2 * SR)
                note = root + 12 + [0, 7, 12, 16, 12, 7, 4, 7][i] + int(r.integers(0, 2)) * 0
                if ps >= n:
                    break
                pe = min(n, ps + int(0.5 * SR))
                tp = np.arange(pe - ps) / SR
                x[ps:pe] += np.sin(2 * np.pi * f(note) * tp) * np.exp(-tp * 9) * 0.10 * pulse
            for i in range(4):  # hat suave
                hs = s + int((i + 0.5) * beat * SR)
                if hs + 2000 < n:
                    h = r.standard_normal(2000) * np.exp(-np.arange(2000) / 280) * 0.03 * pulse
                    x[hs:hs + 2000] += h - _lp(h, 5)
    x = _lp(x, 1.2) * _env(n, 1.0, 1.5)
    x = x / (np.abs(x).max() + 1e-9) * 0.8
    return _stereo(x)
