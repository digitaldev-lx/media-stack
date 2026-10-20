"""audiogen: musica (ROLE=music) e SFX (ROLE=sfx) procedurais, gratis, sem modelos, CPU."""
import os
from pathlib import Path

import soundfile as sf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import synth

ROLE = os.environ.get("ROLE", "music")
WORK = Path(os.environ.get("WORK_DIR", "/work"))
app = FastAPI(title=f"audiogen-{ROLE}")


class Req(BaseModel):
    prompt: str = ""
    kind: str = "whoosh"
    duration: float = 10.0
    engine: str = "procedural"
    seed: int | None = None
    out: str


def _out(rel):
    p = (WORK / rel).resolve()
    if WORK.resolve() not in p.parents:
        raise HTTPException(400, "out fora de /work")
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


@app.post("/music")
def gen_music(r: Req):
    if ROLE != "music":
        raise HTTPException(404)
    if r.engine != "procedural":
        raise HTTPException(400, "so engine=procedural nesta stack")
    sf.write(str(_out(r.out)), synth.music(r.prompt, r.duration, r.seed), synth.SR)
    return {"path": r.out, "duration": r.duration, "engine": r.engine}


@app.post("/sfx")
def gen_sfx(r: Req):
    if ROLE != "sfx":
        raise HTTPException(404)
    if r.engine != "procedural":
        raise HTTPException(400, "so engine=procedural nesta stack")
    if r.kind not in synth.SFX_KINDS:
        raise HTTPException(400, f"kind invalido; validos: {synth.SFX_KINDS}")
    out = _out(r.out)
    sf.write(str(out), synth.sfx(r.kind, r.seed), synth.SR)
    info = sf.info(str(out))
    return {"path": r.out, "duration": round(info.frames / info.samplerate, 3), "engine": r.engine}


@app.get("/kinds")
def kinds():
    return synth.SFX_KINDS


@app.get("/health")
def health():
    return {"ok": True, "role": ROLE}
