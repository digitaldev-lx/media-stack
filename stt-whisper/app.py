"""stt-whisper: legendas e tempos de palavra. faster-whisper (MIT) + pesos Systran (MIT), CPU int8."""
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

WORK = Path(os.environ.get("WORK_DIR", "/work"))
MODELS = Path(os.environ.get("MODELS_DIR", "/models")) / "whisper"
DEFAULT = os.environ.get("WHISPER_MODEL", "base")
app = FastAPI(title="stt-whisper")
_m = {}


class Req(BaseModel):
    path: str
    language: str = "pt"
    model: str = ""


@app.post("/stt")
def stt(req: Req):
    name = req.model or DEFAULT
    src = (WORK / req.path).resolve()
    if WORK.resolve() not in src.parents or not src.exists():
        raise HTTPException(400, "audio invalido")
    if name not in _m:
        from faster_whisper import WhisperModel
        d = MODELS / name
        if not d.exists():
            raise HTTPException(404, f"modelo whisper em falta: {d} (correr o servico models)")
        _m[name] = WhisperModel(str(d), device="cpu", compute_type="int8")
    segs, info = _m[name].transcribe(str(src), language=req.language, word_timestamps=True, vad_filter=True)
    words = []
    for s in segs:
        for w in s.words or []:
            words.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})
    return {"language": info.language, "duration": round(info.duration, 3), "words": words}


@app.get("/health")
def health():
    return {"ok": True}
