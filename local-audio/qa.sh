#!/bin/sh
# QA de um MP4 final: streams, loudness, frames (extremos de pixel) e transcricao Whisper da mistura COMPLETA.
# Uso: qa.sh video.mp4 "0.5 6.6 15.6 52.1 70.8"   (tempos: cenas 3D e meios de transicao)
# Precisa: ffmpeg/ffprobe, python3 com Pillow, whisper-cli + WHISPER_MODEL (opcional).
set -e
V="$1"; TIMES="${2:-0.5 5 10}"; OUT="$(dirname "$V")/qa"; mkdir -p "$OUT"
echo "== streams"; ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate -show_entries format=duration -of compact "$V"
echo "== loudness (alvo -14 LUFS, pico < -1 dBFS)"; ffmpeg -hide_banner -i "$V" -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | grep -E "I:|LRA:|Peak:"
echo "== frames (select=eq(n,N), nunca -ss antes de -i)"
FPS=$(ffprobe -v error -select_streams v -show_entries stream=r_frame_rate -of csv=p=0 "$V" | awk -F/ '{print $1/$2}')
for t in $TIMES; do n=$(python3 -c "print(round($t*$FPS))"); ffmpeg -y -loglevel error -i "$V" -vf "select=eq(n\,$n)" -vsync 0 -frames:v 1 "$OUT/f_$t.png"; done
python3 - "$OUT" <<'EOF'
import glob, sys
from PIL import Image
for p in sorted(glob.glob(sys.argv[1] + "/f_*.png")):
    im = Image.open(p).convert("L"); h = im.histogram(); mean = sum(i * c for i, c in enumerate(h)) / (im.size[0] * im.size[1])
    flag = "PRETO?" if im.getextrema()[1] < 30 else ("BRANCO?" if mean > 240 else "ok")
    print(p, im.getextrema(), round(mean, 1), flag)
EOF
if [ -n "$WHISPER_MODEL" ]; then
  echo "== whisper sobre a mistura completa (confirmar nomes proprios)"
  ffmpeg -y -loglevel error -i "$V" -ar 16000 -ac 1 "$OUT/mix16.wav"
  whisper-cli -m "$WHISPER_MODEL" -l en -f "$OUT/mix16.wav" -nt 2>/dev/null | tr -s '\n'
fi
