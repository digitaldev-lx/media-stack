#!/usr/bin/env bash
# Teste de aceitacao: envia um job, espera, descarrega o MP4 e valida com ffprobe.
# Uso: MEDIA_HMAC_SECRET=... scripts/smoke.sh [exemplo.json] [saida.mp4] [base_url]
set -euo pipefail
cd "$(dirname "$0")/.."
SPEC=${1:-scripts/example-reel-pt-local.json}; OUT=${2:-/tmp/media-stack-smoke.mp4}; BASE=${3:-http://127.0.0.1:8080}
R=$(scripts/post-job.sh "$SPEC" video "$BASE"); echo "$R"
ID=$(printf '%s' "$R" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
for i in $(seq 1 120); do
  J=$(scripts/get.sh "/v1/jobs/$ID" - "$BASE")
  ST=$(printf '%s' "$J" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["status"],d.get("step") or "")')
  echo "[$i] $ST"
  case "$ST" in succeeded*) break;; failed*) printf '%s\n' "$J"; exit 1;; esac
  sleep 5
done
printf '%s' "$J" | python3 -c 'import sys,json;d=json.load(sys.stdin);r=d["result"];print("QA:",r["qa"]["ok"],"| fal_usd:",r.get("fal_usd"),"| avisos:",r.get("warnings"))'
scripts/get.sh "/v1/jobs/$ID/output" "$OUT" "$BASE"
ffprobe -v error -show_entries stream=codec_type,width,height,duration -of compact "$OUT"
echo "MP4: $OUT"
