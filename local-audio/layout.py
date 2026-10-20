#!/usr/bin/env python3
"""Calcula a timeline: cada cena comeca numa batida; a cena "drop" cai num tempo forte (compasso).

Uso:  python layout.py <script.json> <vo_dir> <saida/timeline.json> [first_beat] [beat]
script.json pode ter "drop_scene": "enable", "lead": 0.4, "gap": 0.2, "tail": 2.0.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

cfg = json.loads(Path(sys.argv[1]).read_text())
vo = Path(sys.argv[2])
B0 = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
BP = float(sys.argv[5]) if len(sys.argv) > 5 else 0.5


def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]))


def snap(t, step):
    k = math.ceil((t - B0) / BP / step - 1e-9) * step
    return B0 + k * BP


lead, gap, tail = cfg.get("lead", 0.4), cfg.get("gap", 0.2), cfg.get("tail", 2.0)
drop = cfg.get("drop_scene")
i, cur, out = 0, 0.3, []
for k, sc in enumerate(cfg["scenes"]):
    start = 0.0 if k == 0 else snap(cur + 0.18, 4 if sc["name"] == drop else 1)
    lt = start + (0.3 if k == 0 else lead)
    L = []
    for j, text in enumerate(sc["lines"]):
        lt += gap if j else 0
        d = dur(vo / f"t{i:02d}.wav")
        L.append({"i": i, "text": text, "start": round(lt, 3), "dur": round(d, 3)})
        lt += d; i += 1
    cur = lt
    out.append({"name": sc["name"], "start": round(start, 3), "lines": L})
for a, b in zip(out, out[1:]):
    a["end"] = b["start"]
out[-1]["end"] = round(cur + tail, 3)
res = {"scenes": out, "total": round(cur + tail, 3), "beat0": B0, "beat": BP}
Path(sys.argv[3]).write_text(json.dumps(res, indent=1, ensure_ascii=False))
for s in out:
    print(f'{s["name"]:10s} {s["start"]:6.2f}-{s["end"]:6.2f}')
print("total", res["total"])
