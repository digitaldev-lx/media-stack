#!/bin/sh
# Pipeline completo: guiao -> voz -> musica -> batidas -> timeline -> palavras -> mistura -> composicao -> render -> QA.
# Variaveis (ver README):
#   PY_KOKORO      python do venv Kokoro           (ex.: ../../.venvs/kokoro/bin/python)
#   PY_QWEN        python do venv Qwen3-TTS        (so com "engine": "qwen" no script.json; voz = "voice_pack" ou DEFAULT_VOICE)
#   PY_AUDIO       python do venv audio            (ex.: ../../.venvs/audio/bin/python)
#   WHISPER_MODEL  caminho do ggml-*.bin do whisper.cpp
#   STEP           corre so a partir deste passo (voice|music|layout|words|mix|build|render|qa)
set -e
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd); LA="$ROOT/local-audio"; KIT="$ROOT/packages/three-kit"; export LA
: "${PY_KOKORO:=}"; : "${PY_AUDIO:?definir PY_AUDIO}"; : "${WHISPER_MODEL:?definir WHISPER_MODEL}"
STEP=${STEP:-voice}
order="voice music layout words mix build render qa"
run=0; for s in $order; do [ "$s" = "$STEP" ] && run=1; eval "do_$s=$run"; done
mkdir -p audio/music assets/fonts renders

if [ "$do_voice" = 1 ]; then
  ENGINE=$(python3 -c "import json;print(json.load(open('audio/script.json')).get('engine','kokoro'))")
  if [ "$ENGINE" = qwen ]; then   # voz fixa: voice pack (ver local-audio/README.md, "Voz fixa")
    : "${PY_QWEN:?definir PY_QWEN (python do venv qwen)}"
    VP=$(python3 -c "import json,os;print(json.load(open('audio/script.json')).get('voice_pack') or os.environ.get('DEFAULT_VOICE',''))")
    "$PY_QWEN" "$LA/tts_qwen.py" --voice "$VP" --script audio/script.json --outdir audio/vo
  else
    "$PY_KOKORO" "$LA/tts_kokoro.py" audio/script.json audio/vo
  fi
fi
if [ "$do_music" = 1 ]; then
  "$PY_AUDIO" - <<'EOF'
import json, os, subprocess, sys
s = json.load(open("audio/script.json"))
for m in s.get("music", []):
    out = "audio/music/" + m["file"]
    if os.path.exists(out): print("ja existe", out); continue
    subprocess.run([sys.executable, os.environ["LA"] + "/music_stableaudio.py", m["prompt"], out, str(m["seconds"]), str(m["seed"])], check=True)
EOF
fi
if [ "$do_layout" = 1 ]; then
  A=$("$PY_AUDIO" "$LA/beats.py" audio/music/segA.wav); echo "segA $A"
  B0=$(echo "$A" | python3 -c "import json,sys;print(json.load(sys.stdin)['first_beat'])"); BP=$(echo "$A" | python3 -c "import json,sys;print(json.load(sys.stdin)['beat'])")
  "$PY_AUDIO" "$LA/layout.py" audio/script.json audio/vo audio/timeline.json "$B0" "$BP"
  python3 - <<'EOF'
import json
s = json.load(open("audio/script.json")); tl = json.load(open("audio/timeline.json"))
tr = [dict(at=sc["start"], type=t["type"], d=t["d"]) for t, sc in zip(s["transitions"], tl["scenes"][1:])]
json.dump(tr, open("audio/transitions.json", "w"), indent=1)
EOF
fi
[ "$do_words" = 1 ] && "$PY_AUDIO" "$LA/align_words.py" audio/timeline.json audio/vo audio/words.json
if [ "$do_mix" = 1 ]; then
  SB=$("$PY_AUDIO" "$LA/beats.py" audio/music/segB.wav | python3 -c "import json,sys;print(json.load(sys.stdin)['first_beat'])")
  DROP=$(python3 -c "import json;print(json.load(open('audio/script.json')).get('drop_scene',''))")
  (cd "$LA" && "$PY_AUDIO" mix.py "$OLDPWD/audio/timeline.json" "$OLDPWD/audio/vo" "$OLDPWD/audio/music/segA.wav" "$OLDPWD/audio/music/segB.wav" "$OLDPWD/assets/mix.wav" --drop-scene "$DROP" --transitions "$OLDPWD/audio/transitions.json" --segB-beat "$SB")
fi
if [ "$do_build" = 1 ]; then
  [ -f "$KIT/dist/hf3d.mjs" ] || (cd "$KIT" && npm ci && npm run build)
  [ -f "$KIT/fonts/inter-900.woff" ] || (cd "$KIT" && npm run fonts)
  cp "$KIT/dist/hf3d.mjs" assets/ && cp "$KIT"/fonts/* assets/fonts/
  python3 build.py
  npx --yes hyperframes@0.8.181 lint
fi
[ "$do_render" = 1 ] && npx --yes hyperframes@0.8.181 render --quality delivery --fps 30 --output renders/showcase.mp4 > renders/render.log 2>&1 && tail -3 renders/render.log
if [ "$do_qa" = 1 ]; then
  TIMES=$(python3 -c "import json;tl=json.load(open('audio/timeline.json'));print(' '.join(['1.0']+[f\"{s['start']:.2f}\" for s in tl['scenes'][1:]]+[f\"{tl['total']-1:.2f}\"]))")
  WHISPER_MODEL="$WHISPER_MODEL" sh "$LA/qa.sh" renders/showcase.mp4 "$TIMES"
fi
