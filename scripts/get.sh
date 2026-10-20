#!/usr/bin/env bash
# Uso: MEDIA_HMAC_SECRET=... scripts/get.sh /v1/jobs/<id>[/output] [ficheiro_saida] [base_url]
set -euo pipefail
P=${1:?path}; OUT=${2:--}; BASE=${3:-http://127.0.0.1:8080}
: "${MEDIA_HMAC_SECRET:?definir MEDIA_HMAC_SECRET no ambiente}"
TS=$(date +%s)
SIG=$(printf '%s' "${TS}.GET.${P}." | openssl dgst -sha256 -hmac "$MEDIA_HMAC_SECRET" -hex | sed 's/^.* //')
if [ "$OUT" = "-" ]; then curl -sS "$BASE$P" -H "X-Timestamp: $TS" -H "X-Signature: sha256=$SIG"; echo
else curl -sS -o "$OUT" "$BASE$P" -H "X-Timestamp: $TS" -H "X-Signature: sha256=$SIG"; fi
