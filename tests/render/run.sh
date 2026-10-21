#!/usr/bin/env bash
# Regressao do servico render-hyperframes: renderiza cada caso (make-cases.js e/ou 3D) DENTRO do contentor,
# pela API interna POST /render, e valida duracao, streams e frames (sem preto).
# Uso: tests/render/run.sh <imagem> <work_dir> [casos...]
#   ex.: tests/render/run.sh media-render-hyperframes:1 /tmp/regress/new
set -euo pipefail
IMG=${1:?imagem}; WORK=$(cd "${2:?work_dir}" && pwd); shift 2
CASES=${*:-$(cd "$WORK" && ls -d */ | tr -d /)}
PORT=${PORT:-3901}; NAME=regress-render-$$
docker run -d --rm --name "$NAME" -p 127.0.0.1:$PORT:3000 -v "$WORK:/work" --shm-size 2g \
  --cpus "${RENDER_CPUS:-4}" --memory "${RENDER_MEM:-3g}" --security-opt no-new-privileges:true --cap-drop ALL --init -e RENDER_3D_WORKERS="${RENDER_3D_WORKERS:-1}" "$IMG" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 1; done
FAIL=0
for c in $CASES; do
  t0=$(date +%s)
  KIT=$(python3 -c 'import json,sys;print(str(json.load(open(sys.argv[1])).get("kit",False)).lower())' "$WORK/$c/expect.json" 2>/dev/null || echo false)
  ID=$(curl -sf -X POST "http://127.0.0.1:$PORT/render" -H 'content-type: application/json' -d "{\"dir\":\"$c\",\"out\":\"output.mp4\",\"timeout_s\":${TIMEOUT_S:-900},\"kit\":$KIT}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
  while :; do
    ST=$(curl -sf "http://127.0.0.1:$PORT/render/$ID" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["status"]);print((d.get("error") or "")[-600:])')
    case "$(echo "$ST" | head -1)" in succeeded) break;; failed) echo "FALHOU $c: $(echo "$ST" | tail -n +2)"; FAIL=1; continue 2;; esac
    sleep 2
  done
  secs=$(( $(date +%s) - t0 ))
  python3 - "$WORK/$c" "$secs" <<'EOF' || FAIL=1
import json, subprocess, sys
d, secs = sys.argv[1], sys.argv[2]; f = d + "/output.mp4"
exp = json.load(open(d + "/expect.json")) if __import__("os").path.exists(d + "/expect.json") else {}
p = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", f]))
types = [s["codec_type"] for s in p["streams"]]; v = next(s for s in p["streams"] if s["codec_type"] == "video")
dur = float(p["format"]["duration"]); ok = True; notes = []
if exp.get("total") and abs(dur - exp["total"]) > 0.15: ok = False; notes.append(f"duracao {dur} != {exp['total']}")
if exp.get("audio") and "audio" not in types: ok = False; notes.append("sem audio")
# frames a 15%, 50% e 85%: o maximo de luminancia tem de passar de 40 (nao preto)
mx = []
for frac in (0.15, 0.5, 0.85):
    n = int(dur * frac * 30)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-vf", f"select=eq(n\\,{n}),scale=160:-1,format=gray", "-vsync", "0", "-frames:v", "1", "-f", "rawvideo", "-"], capture_output=True).stdout
    m = max(raw) if raw else 0; mx.append(m)
    if m < 40: ok = False; notes.append(f"frame {n} preto (max {m})")
print(f"{'OK ' if ok else 'ERRO'} {d.split('/')[-1]:18s} {v['width']}x{v['height']} {v['r_frame_rate']} dur={dur:.2f} streams={types} max_luma={mx} render={secs}s {' '.join(notes)}")
sys.exit(0 if ok else 1)
EOF
done
exit $FAIL
