"""SFX sintetizados em numpy (sem samples, sem licencas): whoosh, riser, boom/impacto, glitch, tick.
Todos recebem um numpy Generator com semente -> o mesmo pedido da sempre o mesmo som."""
import numpy as np
from scipy.signal import butter, sosfilt


def put(buf, x, t, sr, g=1.0, pan=0.0):
    a = int(t * sr); n = buf.shape[0]
    if a >= n: return
    x = x[: n - a]
    buf[a:a + len(x), 0] += x * g * (1 - pan); buf[a:a + len(x), 1] += x * g * (1 + pan)


def whoosh(rng, dur, sr, f0=300, f1=4000):
    n = int(dur * sr); x = rng.standard_normal(n); out = np.zeros(n)
    for c in range(24):
        a, b = c * n // 24, (c + 1) * n // 24; f = f0 * (f1 / f0) ** (c / 24)
        out[a:b] = sosfilt(butter(2, [f * 0.6, min(f * 1.6, sr / 2 - 100)], "bandpass", fs=sr, output="sos"), x[a:b])
    return out * np.sin(np.linspace(0, np.pi, n)) ** 2 / (np.abs(out).max() + 1e-9)


def riser(rng, dur, sr):
    n = int(dur * sr); t = np.arange(n) / sr; x = rng.standard_normal(n); out = np.zeros(n)
    for c in range(32):
        a, b = c * n // 32, (c + 1) * n // 32; f = 400 * (9000 / 400) ** (c / 32)
        out[a:b] = sosfilt(butter(2, [f * 0.7, min(f * 1.4, sr / 2 - 100)], "bandpass", fs=sr, output="sos"), x[a:b])
    tone = np.sin(2 * np.pi * np.cumsum(220 * (4 ** (t / dur))) / sr) * 0.25
    return (out / (np.abs(out).max() + 1e-9) + tone) * (t / dur) ** 2.2


def boom(rng, dur, sr):
    n = int(dur * sr); t = np.arange(n) / sr; f = 38 + 90 * np.exp(-t * 18)
    x = np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-t * 2.6)
    nz = sosfilt(butter(2, 3000, "highpass", fs=sr, output="sos"), rng.standard_normal(n)) * np.exp(-t * 5) * 0.35
    return np.tanh((x + nz) * 1.6)


def glitch(rng, dur, sr):
    n = int(dur * sr); x = np.zeros(n); i = 0
    while i < n:
        L = int(rng.integers(300, 2400)); f = rng.choice([180, 360, 720, 1440, 2880])
        x[i:i + L] = np.sign(np.sin(2 * np.pi * f * np.arange(min(L, n - i)) / sr)) * rng.uniform(0.3, 1)
        i += L + int(rng.integers(0, 900))
    return x * 0.6


def tick(sr):
    n = int(0.05 * sr); t = np.arange(n) / sr
    return np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 120)
