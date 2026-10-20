// Camada DOM por cima do canvas: HUD, legendas palavra a palavra, titulo do gancho, fade final.
// Como as transicoes sao feitas dentro do GL, esta camada nunca desaparece.
(function () {
  var TL = window.TL,
    WORDS = window.WORDS,
    TOTAL = TL.total,
    FPS = 30;
  var WD = {};
  WORDS.forEach(function (w) {
    (WD[w.line] = WD[w.line] || []).push(w);
  });
  function $(s) {
    return document.querySelector(s);
  }
  function pad(n, w) {
    n = String(n);
    while (n.length < w) n = "0" + n;
    return n;
  }
  function wd(i, k) {
    var a = WD[i];
    return a[Math.min(k, a.length - 1)].t0;
  }
  var tl = gsap.timeline({ paused: true });

  // gancho: palavras ao ritmo da voz
  document.querySelectorAll("#hook-head .hw").forEach(function (w) {
    var p = w.getAttribute("data-w").split(",");
    tl.fromTo(
      w,
      { yPercent: 110, rotationX: -70, opacity: 0, transformPerspective: 600 },
      {
        yPercent: 0,
        rotationX: 0,
        opacity: 1,
        duration: 0.45,
        ease: "back.out(1.6)",
      },
      wd(+p[0], +p[1]) - 0.06,
    );
  });
  [
    ["#chip1", wd(1, 0), wd(1, 1) + 0.25],
    ["#chip2", wd(1, 2), wd(1, 4) + 0.2],
    ["#chip3", wd(1, 5), null],
  ].forEach(function (c, k) {
    tl.fromTo(
      c[0],
      { opacity: 0, y: 40, scale: k === 2 ? 1.6 : 0.8 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.4,
        ease: k === 2 ? "expo.out" : "back.out(2)",
      },
      c[1] - 0.05,
    );
    if (c[2])
      tl.fromTo(
        c[0] + " .strike",
        { scaleX: 0 },
        { scaleX: 1, duration: 0.25, ease: "power3.out" },
        c[2],
      );
  });
  var hookEnd = TL.scenes[1].start;
  tl.to(
    "#hook-dom",
    { opacity: 0, y: -30, duration: 0.35, ease: "power2.in" },
    hookEnd - 0.45,
  );
  tl.fromTo(
    "#fade",
    { opacity: 0 },
    { opacity: 1, duration: 0.6, ease: "power1.in" },
    TOTAL - 0.6,
  );

  var cap = $("#cap"),
    cur = -1,
    beatEls = document.querySelectorAll("#beats i");
  window.__dom = function (t) {
    var f = Math.round(t * FPS);
    $("#hud-tc").textContent =
      pad(Math.floor(t / 60), 2) +
      ":" +
      pad((t % 60).toFixed(2), 5) +
      "  ·  F" +
      pad(f, 4);
    var si = 0;
    for (var k = 0; k < TL.scenes.length; k++)
      if (t >= TL.scenes[k].start) si = k;
    $("#hud-scene").textContent =
      pad(si + 1, 2) +
      " / " +
      TL.scenes.length +
      "  ·  " +
      TL.scenes[si].name.toUpperCase() +
      "  ·  THREE.JS + HF3D";
    var bi = Math.floor((t - TL.beat0) / TL.beat);
    for (var j = 0; j < beatEls.length; j++)
      beatEls[j].className = bi >= 0 && ((bi % 4) + 4) % 4 === j ? "on" : "";
    var li = -1;
    for (var key in WD) {
      var arr = WD[key];
      if (t >= arr[0].t0 - 0.15 && t <= arr[arr.length - 1].t1 + 0.35)
        li = +key;
    }
    if (li !== cur) {
      cap.innerHTML = "";
      if (li >= 0)
        WD[li].forEach(function (w) {
          var s = document.createElement("span");
          s.textContent = w.w;
          cap.appendChild(s);
        });
      cur = li;
    }
    cap.style.opacity = li >= 0 ? 1 : 0;
    if (li >= 0)
      for (var c = 0; c < cap.children.length; c++) {
        var w = WD[li][c];
        cap.children[c].className = t >= w.t1 ? "done" : t >= w.t0 ? "on" : "";
      }
  };
  window.__timelines["main"] = tl;
})();
