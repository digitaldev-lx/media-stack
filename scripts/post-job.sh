#!/usr/bin/env bash
# Uso: MEDIA_HMAC_SECRET=... scripts/post-job.sh <ficheiro.json> [kind] [base_url]
# Assina e envia POST /v1/jobs. Segredo SO por variavel de ambiente.
set -euo pipefail
FILE=${1:?ficheiro json (campo spec)}; KIND=${2:-video}; BASE=${3:-http://127.0.0.1:8080}
: "${MEDIA_HMAC_SECRET:?definir MEDIA_HMAC_SECRET no ambiente}"
BODY=$(python3 -c 'import json,sys;print(json.dumps({"kind":sys.argv[2],"spec":json.load(open(sys.argv[1]))}))' "$FILE" "$KIND")
TS=$(date +%s); URLPATH=/v1/jobs
SIG=$(printf '%s' "${TS}.POST.${URLPATH}.${BODY}" | openssl dgst -sha256 -hmac "$MEDIA_HMAC_SECRET" -hex | sed 's/^.* //')
curl -sS -X POST "$BASE$URLPATH" -H 'content-type: application/json' -H "X-Timestamp: $TS" -H "X-Signature: sha256=$SIG" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY:-$(uuidgen)}" --data-binary "$BODY"
