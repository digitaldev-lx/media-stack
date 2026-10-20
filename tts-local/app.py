"""tts-local: fallback de voz gratis e local (Piper pt_PT) quando a fal.ai falha, esgota saldo ou excede o tecto.
  engine=piper  -> OHF-Voice/piper1-gpl (codigo GPL-3.0, servico isolado por HTTP); vozes em /models/piper/<id>.onnx
Escreve WAV mono em /work/<out>. Modelos montados em /models (read-only)."""
import os
import wave
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

WORK = Path(os.environ.get("WORK_DIR", "/work"))
MODELS = Path(os.environ.get("MODELS_DIR", "/models"))
app = FastAPI(title="tts-local")
_piper: dict = {}


class TtsReq(BaseModel):
    text: str
    engine: str = "piper"
    voice: str = "pt_PT-tugao-medium"
    speed: float = 1.0
    out: str


def _out_path(rel: str) -> Path:
    p = (WORK / rel).resolve()
    if WORK.resolve() not in p.parents:
        raise HTTPException(400, "out fora de /work")
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _duration(p: Path) -> float:
    info = sf.info(str(p))
    return round(info.frames / info.samplerate, 3)


def _piper_voice(voice: str):
    if voice not in _piper:
        from piper import PiperVoice
        model = MODELS / "piper" / f"{voice}.onnx"
        if not model.exists():
            raise HTTPException(404, f"voz piper em falta: {model} (correr o servico models)")
        _piper[voice] = PiperVoice.load(str(model))
    return _piper[voice]


@app.post("/tts")
def tts(req: TtsReq):
    out = _out_path(req.out)
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "texto vazio")
    if req.engine == "piper":
        from piper import SynthesisConfig
        voice = _piper_voice(req.voice)
        cfg = SynthesisConfig(length_scale=1.0 / max(0.5, min(2.0, req.speed)))
        with wave.open(str(out), "wb") as wf:
            voice.synthesize_wav(text, wf, syn_config=cfg)
    else:
        raise HTTPException(400, f"engine desconhecido: {req.engine}")
    return {"path": req.out, "duration": _duration(out), "engine": req.engine, "voice": req.voice}


@app.get("/voices")
def voices():
    piper = sorted(p.stem for p in (MODELS / "piper").glob("*.onnx")) if (MODELS / "piper").exists() else []
    return {"piper": piper}


@app.get("/health")
def health():
    return {"ok": True}
