#!/usr/bin/env python3
"""Monta index.html (template 3D com o kit hf3d) a partir de src/ + audio/*.json (ver README)."""
import json
from pathlib import Path

HERE = Path(__file__).parent
A = HERE / "audio"
tl = json.loads((A / "timeline.json").read_text())
words = json.loads((A / "words.json").read_text())
tr = json.loads((A / "transitions.json").read_text())
viz = json.loads((A / "viz.json").read_text()) if (A / "viz.json").exists() else {}
script = json.loads((A / "script.json").read_text())
brand = script.get("brand", {"name": "hf3d", "by": "Built with HyperFrames"})
T = tl["total"]

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>HyperFrames 3D showcase</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face {{ font-family: "Inter"; font-weight: 800; src: url(assets/fonts/inter-800.woff2) format("woff2"); }}
@font-face {{ font-family: "Inter"; font-weight: 900; src: url(assets/fonts/inter-900.woff2) format("woff2"); }}
@font-face {{ font-family: "JetBrains Mono"; font-weight: 700; src: url(assets/fonts/jbmono-700.woff2) format("woff2"); }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #000; }}
#root {{ position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Inter", sans-serif; color: #f5f5f7; }}
#gl {{ position: absolute; inset: 0; width: 1920px; height: 1080px; display: block; }}
#hook-dom {{ position: absolute; left: 110px; top: 150px; width: 980px; }}
#hook-head .hl {{ overflow: hidden; padding: 6px 0; }}
#hook-head .hw {{ display: inline-block; font-weight: 900; font-size: 118px; letter-spacing: -0.045em; line-height: 1; margin-right: 24px; text-shadow: 0 0 40px rgba(124,92,255,0.55); }}
#hook-head .acc {{ color: #c6ff3d; text-shadow: 0 0 40px rgba(198,255,61,0.6); }}
#hook-chips {{ margin-top: 60px; display: flex; gap: 22px; }}
.chip {{ position: relative; padding: 14px 26px; border-radius: 999px; font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: 28px; letter-spacing: 0.06em; background-color: rgba(20,20,30,0.7); border: 2px solid #34344d; color: #d4d4e0; }}
.chip.lime {{ background-color: #c6ff3d; border-color: #c6ff3d; color: #07070a; box-shadow: 0 0 40px rgba(198,255,61,0.6); }}
.strike {{ position: absolute; left: 16px; right: 16px; top: 50%; height: 5px; margin-top: -2px; background-color: #ff3d81; transform-origin: left center; display: block; }}
#hud {{ position: absolute; inset: 0; pointer-events: none; font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: 18px; letter-spacing: 0.14em; color: #a3a3be; text-shadow: 0 0 10px rgba(0,0,0,0.8); }}
#hud .tl {{ position: absolute; left: 40px; top: 30px; }}
#hud .tr {{ position: absolute; right: 40px; top: 30px; text-align: right; }}
#hud .bl {{ position: absolute; left: 40px; bottom: 30px; }}
#beats {{ display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }}
#beats i {{ width: 14px; height: 14px; border-radius: 3px; background-color: #3a3a55; display: block; }}
#beats i.on {{ background-color: #c6ff3d; box-shadow: 0 0 12px #c6ff3d; }}
#captions {{ position: absolute; left: 0; right: 0; bottom: 62px; display: flex; justify-content: center; pointer-events: none; }}
#cap {{ padding: 14px 30px; border-radius: 16px; background-color: rgba(5,5,10,0.72); font-size: 38px; font-weight: 800; white-space: nowrap; opacity: 0; }}
#cap span {{ display: inline-block; margin: 0 7px; color: #8a8aa3; }}
#cap span.on {{ color: #c6ff3d; }}
#cap span.done {{ color: #f5f5f7; }}
#fade {{ position: absolute; inset: 0; background-color: #000; opacity: 0; pointer-events: none; }}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{T}" data-width="1920" data-height="1080" data-fps="30">
  <canvas id="gl" width="1920" height="1080"></canvas>
  <div id="hook-dom">
    <div id="hook-head">
      <div class="hl"><span class="hw" data-w="0,0">EVERYTHING</span></div>
      <div class="hl"><span class="hw" data-w="0,1">YOU</span><span class="hw" data-w="0,2">ARE</span><span class="hw" data-w="0,3">WATCHING</span></div>
      <div class="hl"><span class="hw" data-w="0,4">IS</span><span class="hw acc" data-w="0,5">CODE.</span></div>
    </div>
    <div id="hook-chips">
      <div class="chip" id="chip1">NO CAMERA<i class="strike"></i></div>
      <div class="chip" id="chip2">NO TIMELINE<i class="strike"></i></div>
      <div class="chip lime" id="chip3">JUST HTML + WEBGL</div>
    </div>
  </div>
  <div id="hud">
    <div class="tl">HYPERFRAMES · HF3D · ONE WEBGL STAGE</div>
    <div class="tr"><span id="hud-tc"></span><div id="beats"><i></i><i></i><i></i><i></i></div></div>
    <div class="bl" id="hud-scene"></div>
  </div>
  <div id="captions"><div id="cap"></div></div>
  <div id="fade"></div>
  <audio id="mix" src="assets/mix.wav" data-start="0" data-duration="{T}" data-track-index="10" data-volume="1"></audio>
</div>
<script>
window.TL = {json.dumps(tl)};
window.WORDS = {json.dumps(words)};
window.TR = {json.dumps(tr)};
window.VIZ = {json.dumps(viz, separators=(",", ":"))};
window.BRAND = {json.dumps(brand)};
window.__hf = window.__hf || {{}};
window.__hf.buildReady = window.__hf.buildReady || {{}};
window.__hf.buildReady["hf3d"] = new Promise(function (r) {{ window.__hf3dReady = r; }});
{(HERE / "src/dom.js").read_text()}
</script>
<script type="module">
{(HERE / "src/scenes.js").read_text()}
</script>
</body>
</html>
"""
(HERE / "index.html").write_text(page)
print("index.html", len(page) // 1024, "KB · duracao", T)
