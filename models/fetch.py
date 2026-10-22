"""Descarrega modelos para /models (volume). Nunca para dentro das imagens.
Uso: python fetch.py piper_pt whisper_base [whisper_small]
Sem tokens: todos os modelos sao publicos."""
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

M = Path(os.environ.get("MODELS_DIR", "/models"))
HF = "https://huggingface.co"


def get(url: str, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print("ja existe", dest); return
    print("a descarregar", url, "->", dest)
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(dest)


def piper(lang_path: str, voice_id: str, local_id: str):
    base = f"{HF}/rhasspy/piper-voices/resolve/main/{urllib.parse.quote(lang_path)}"
    get(f"{base}/{urllib.parse.quote(voice_id)}.onnx", M / "piper" / f"{local_id}.onnx")
    get(f"{base}/{urllib.parse.quote(voice_id)}.onnx.json", M / "piper" / f"{local_id}.onnx.json")


def hf_snapshot(repo: str, dest: Path):
    from huggingface_hub import snapshot_download
    snapshot_download(repo, local_dir=str(dest))


JOBS = {
    # pt_PT: unica voz pt_PT do rhasspy/piper-voices (dataset CC0; finetune de lessac, ver licencas no README)
    "piper_pt": lambda: piper("pt/pt_PT/tugão/medium", "pt_PT-tugão-medium", "pt_PT-tugao-medium"),
    "whisper_base": lambda: hf_snapshot("Systran/faster-whisper-base", M / "whisper" / "base"),
    "whisper_small": lambda: hf_snapshot("Systran/faster-whisper-small", M / "whisper" / "small"),
    # Qwen3-TTS (Apache-2.0), modo clone para a voz fixa (tts-qwen). 0.6B ~2,5 GB (CPU); 1.7B ~4,5 GB (GPU ou CPU lento)
    "qwen_tts_06b": lambda: hf_snapshot("Qwen/Qwen3-TTS-12Hz-0.6B-Base", M / "qwen" / "Qwen3-TTS-12Hz-0.6B-Base"),
    "qwen_tts_17b": lambda: hf_snapshot("Qwen/Qwen3-TTS-12Hz-1.7B-Base", M / "qwen" / "Qwen3-TTS-12Hz-1.7B-Base"),
}

if __name__ == "__main__":
    want = sys.argv[1:] or ["piper_pt", "whisper_base"]
    for w in want:
        if w not in JOBS:
            sys.exit(f"desconhecido: {w}; validos: {list(JOBS)}")
        JOBS[w]()
    print("ok")
