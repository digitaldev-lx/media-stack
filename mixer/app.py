"""mixer: mistura de audio (voz + musica com ducking + SFX) e QA, so com FFmpeg.
Reimplementacao propria (substitui o AudioMixer do OpenMontage, AGPL): sidechaincompress + loudnorm."""
import json
import os
import subprocess
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

WORK = Path(os.environ.get("WORK_DIR", "/work"))
app = FastAPI(title="mixer")


def p(rel: str) -> Path:
    x = (WORK / rel).resolve()
    if WORK.resolve() not in x.parents:
        raise HTTPException(400, "caminho fora de /work")
    return x


class Clip(BaseModel):
    file: str
    at: float = 0.0
    volume: float = 1.0


class MusicIn(BaseModel):
    file: str
    volume: float = 0.35


class MixReq(BaseModel):
    duration: float
    voice: List[Clip] = []
    music: Optional[MusicIn] = None
    sfx: List[Clip] = []
    duck: bool = True
    lufs: float = -14.0
    out: str


def run(cmd: List[str], timeout=600):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise HTTPException(500, r.stderr[-1500:])
    return r


FMT = "aformat=sample_rates=48000:channel_layouts=stereo"


@app.post("/mix")
def mix(req: MixReq):
    out = p(req.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    inputs: List[str] = []
    parts: List[str] = []
    n = 0
    vlabels, slabels = [], []
    for c in req.voice:
        inputs += ["-i", str(p(c.file))]
        ms = int(c.at * 1000)
        parts.append(f"[{n}:a]{FMT},adelay={ms}|{ms},volume={c.volume}[v{n}]")
        vlabels.append(f"[v{n}]"); n += 1
    for c in req.sfx:
        inputs += ["-i", str(p(c.file))]
        ms = int(c.at * 1000)
        parts.append(f"[{n}:a]{FMT},adelay={ms}|{ms},volume={c.volume}[s{n}]")
        slabels.append(f"[s{n}]"); n += 1
    final_in = []
    if vlabels:
        parts.append("".join(vlabels) + f"amix=inputs={len(vlabels)}:normalize=0:dropout_transition=0[vmix]")
    if req.music:
        inputs += ["-stream_loop", "-1", "-i", str(p(req.music.file))]
        fade_at = max(0.0, req.duration - 1.5)
        parts.append(f"[{n}:a]{FMT},atrim=0:{req.duration},volume={req.music.volume},"
                     f"afade=t=in:d=0.5,afade=t=out:st={fade_at}:d=1.5[mus]")
        n += 1
        if vlabels and req.duck:
            parts.append("[vmix]asplit=2[vkey][vout]")
            parts.append("[mus][vkey]sidechaincompress=threshold=0.03:ratio=10:attack=15:release=400[musd]")
            final_in += ["[vout]", "[musd]"]
        else:
            if vlabels:
                final_in.append("[vmix]")
            final_in.append("[mus]")
    elif vlabels:
        final_in.append("[vmix]")
    final_in += slabels
    if not final_in:
        raise HTTPException(400, "nada para misturar")
    parts.append("".join(final_in) + f"amix=inputs={len(final_in)}:normalize=0:dropout_transition=0,"
                 f"alimiter=limit=0.95,loudnorm=I={req.lufs}:TP=-1.5:LRA=11,"
                 f"aresample=48000,apad=whole_dur={req.duration}[a]")
    cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(parts),
           "-map", "[a]", "-t", str(req.duration), "-ac", "2", "-ar", "48000", str(out)]
    run(cmd)
    return {"path": req.out, "duration": req.duration}


class PathReq(BaseModel):
    path: str


class PrepReq(BaseModel):
    src: str
    dst: str
    duration: float
    format: str = "vertical"


SIZES = {"vertical": (1080, 1920), "horizontal": (1920, 1080), "square": (1080, 1080)}


@app.post("/prep-video")
def prep_video(req: PrepReq):
    """Normaliza o clip de fundo para o HyperFrames: tamanho exacto, 30 fps, GOP fechado (1 keyframe/s), sem audio, loop se curto."""
    w, h = SIZES.get(req.format, SIZES["vertical"])
    run(["ffmpeg", "-v", "error", "-y", "-stream_loop", "-1", "-i", str(p(req.src)), "-t", str(req.duration),
         "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps=30,format=yuv420p",
         "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", "30", "-keyint_min", "30",
         "-movflags", "+faststart", str(p(req.dst))], timeout=900)
    return {"path": req.dst}


@app.post("/probe")
def probe(req: PathReq):
    r = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(p(req.path))])
    j = json.loads(r.stdout)
    v = next((s for s in j["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)
    return {"duration": float(j["format"]["duration"]), "size": int(j["format"]["size"]),
            "video": v and {"w": v["width"], "h": v["height"], "fps": v["r_frame_rate"], "codec": v["codec_name"]},
            "audio": a and {"codec": a["codec_name"], "rate": a["sample_rate"]}}


@app.post("/qa")
def qa(req: PathReq):
    """Gate pos-render: duracao, audio presente, e extrema de pixeis em 3 frames (frames pretos silenciosos)."""
    info = probe(req)
    dur = info["duration"]
    maxes = []
    for frac in (0.2, 0.5, 0.8):
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(dur * frac), "-i", str(p(req.path)),
                            "-frames:v", "1", "-vf", "scale=64:64", "-pix_fmt", "gray", "-f", "rawvideo", "-"],
                           capture_output=True, timeout=120)
        maxes.append(max(r.stdout) if r.stdout else 0)
    vol = subprocess.run(["ffmpeg", "-v", "info", "-i", str(p(req.path)), "-af", "volumedetect", "-vn", "-f", "null", "-"],
                         capture_output=True, text=True, timeout=120).stderr
    mean = next((float(l.split("mean_volume:")[1].split()[0]) for l in vol.splitlines() if "mean_volume" in l), None)
    ok = info["video"] is not None and info["audio"] is not None and max(maxes) > 40 and (mean is None or mean > -50)
    return {"ok": ok, "frame_max_luma": maxes, "mean_volume_db": mean, **info}


@app.get("/health")
def health():
    return {"ok": True}
