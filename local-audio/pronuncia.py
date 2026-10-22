#!/usr/bin/env python3
"""Revisao de pronuncia para uma voz fixa (voice pack): homografos (escrevem-se igual, dizem-se diferente).

Os DADOS vivem no pack (fora do repo): <pack>/homografos.json (lista de risco) e <pack>/correcoes.json (memoria).
Este script so tem o mecanismo.

  check   lista as frases com homografos e diz se ja ha correcao aprovada
  review  gera variantes (sementes alternativas + reformulacoes por contexto, nunca acentos inventados),
          um mp3 por variante e um indice, numa pasta para o dono da voz ouvir; cria escolhas.json
  apply   le a escolha (escolhas.json, campo "escolha" por frase) e grava-a em <pack>/correcoes.json
  resolve devolve, para uma lista de frases, o texto e a semente aprovados (usado pelo reelgen)

Uso:
  python pronuncia.py check   --pack <pasta> --lines <reel.json|script.json|lines.json>
  python pronuncia.py review  --pack <pasta> --lines <...> --name <video> [--out ~/Downloads] --py <python do venv qwen>
  python pronuncia.py apply   --pack <pasta> --review <pasta de revisao>
Formato de correcoes.json:
  {"frases":   {"<frase normalizada>": {"text": "<texto final>", "seed": 7, "variante": "B", "origem": "<frase original>", "data": "..."}},
   "palavras": {"copia": "está a copiar"}}     # reformulacao preferida, proposta em 1.o lugar nos videos seguintes
"""
import argparse
import datetime
import json
import re
import subprocess
import sys
from pathlib import Path

SEEDS_EXTRA = [7, 42]          # sementes alternativas para alem da do pack


def norm_key(text):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", text.lower())).strip()


def load_lines(p):
    d = json.loads(Path(p).read_text())
    if isinstance(d, list):
        return [x if isinstance(x, str) else x["text"] for x in d]
    if "lines" in d:                                      # reel.json do reelgen
        return [l["text"] for l in d["lines"]]
    return [l if isinstance(l, str) else l["text"] for sc in d["scenes"] for l in sc["lines"]]   # script.json


def pack_data(pack):
    pack = Path(pack)
    cfg = json.loads(((pack / "params.json") if (pack / "params.json").exists() else (pack / "voice.json")).read_text())
    hom = json.loads((pack / "homografos.json").read_text())["palavras"] if (pack / "homografos.json").exists() else {}
    corr = json.loads((pack / "correcoes.json").read_text()) if (pack / "correcoes.json").exists() else {"frases": {}, "palavras": {}}
    corr.setdefault("frases", {}); corr.setdefault("palavras", {})
    return cfg, hom, corr


def hits(text, hom):
    toks = re.findall(r"[\wÀ-ÿ-]+", text.lower())
    return [w for w in hom if w in toks or (" " in w and w in text.lower())]


def replace_word(text, a, b):
    def sub(m):
        s = m.group(0)
        return b[0].upper() + b[1:] if s[0].isupper() else b
    return re.sub(rf"(?<![\wÀ-ÿ]){re.escape(a)}(?![\wÀ-ÿ])", sub, text, count=1, flags=re.I)


def variants(text, ws, hom, corr, seed):
    """A = original com a semente do pack; sementes alternativas; reformulacoes (a preferida primeiro)."""
    out = [("original", text, seed)] + [("semente", text, s) for s in SEEDS_EXTRA]
    refs = []
    for w in ws:
        pref = corr["palavras"].get(w)
        cand = ([[w, pref]] if pref else []) + [r for r in hom[w].get("reformular", []) if r[1] != pref]
        for a, b in cand:
            t2 = replace_word(text, a, b)
            if t2 != text and t2 not in [r[1] for r in refs]:
                refs.append(("reformulacao", t2, seed))
    return out + refs[:2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["check", "review", "apply", "resolve"])
    ap.add_argument("--pack", required=True); ap.add_argument("--lines"); ap.add_argument("--name"); ap.add_argument("--review")
    ap.add_argument("--out", default=str(Path.home() / "Downloads")); ap.add_argument("--py", default=sys.executable)
    a = ap.parse_args()
    pack = Path(a.pack); cfg, hom, corr = pack_data(pack); seed = int(cfg.get("seed", 1234))

    if a.cmd in ("check", "resolve"):
        res = []
        for i, t in enumerate(load_lines(a.lines), 1):
            c = corr["frases"].get(norm_key(t)); ws = hits(t, hom)
            res.append({"n": i, "text": t, "homografos": ws, "aprovada": c})
            if a.cmd == "check" and ws:
                print(f"{i:02d} {'OK ' if c else '???'} {t}  [{', '.join(ws)}]" + (f"  -> {c['variante']}: {c['text']} (semente {c['seed']})" if c else ""))
        if a.cmd == "resolve":
            print(json.dumps(res, ensure_ascii=False))
        return

    if a.cmd == "review":
        d = Path(a.out).expanduser() / f"{a.name}-revisao-pronuncia"; d.mkdir(parents=True, exist_ok=True)
        jobs, meta = [], []
        for i, t in enumerate(load_lines(a.lines), 1):
            ws = hits(t, hom)
            if not ws:
                continue
            vs = variants(t, ws, hom, corr, seed); entry = {"n": i, "original": t, "homografos": ws, "variantes": {}, "escolha": None}
            for k, (kind, txt, s) in zip("ABCDEFG", vs):
                f = f"frase{i:02d}-{k}-{kind}-seed{s}.wav"
                jobs.append({"text": txt, "seed": s, "out": f})
                entry["variantes"][k] = {"tipo": kind, "text": txt, "seed": s, "mp3": f[:-4] + ".mp3"}
            prev = corr["frases"].get(norm_key(t))
            if prev:
                entry["ja_aprovada"] = prev
            meta.append(entry)
        if not meta:
            print("nenhuma frase com homografos"); return
        sj = d / "_jobs.json"; sj.write_text(json.dumps({"scenes": [{"name": "rev", "lines": jobs}]}, ensure_ascii=False))
        tts = Path(__file__).with_name("tts_qwen.py")
        t0 = datetime.datetime.now()
        subprocess.run([a.py, str(tts), "--voice", str(pack), "--script", str(sj), "--outdir", str(d)], check=True)
        secs = (datetime.datetime.now() - t0).total_seconds()
        for j in jobs:
            w = d / j["out"]
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(w), "-af", "loudnorm=I=-16:TP=-1.5", "-b:a", "160k", str(w.with_suffix(".mp3"))], check=True)
            w.unlink()
        for f in ("_jobs.json", "lines.json"):
            (d / f).unlink(missing_ok=True)
        (d / "escolhas.json").write_text(json.dumps({"video": a.name, "pack": cfg.get("id", pack.name), "frases": meta}, ensure_ascii=False, indent=1))
        idx = [f"REVISAO DE PRONUNCIA: {a.name} (voz {cfg.get('id', pack.name)})", "",
               "Ouvir cada variante. Escolher UMA letra por frase e escreve-la em escolhas.json, campo \"escolha\".",
               "Depois: python local-audio/pronuncia.py apply --pack <pack> --review <esta pasta>", ""]
        for e in meta:
            idx.append(f"Frase {e['n']:02d}: {e['original']}   (homografos: {', '.join(e['homografos'])})")
            for k, v in e["variantes"].items():
                idx.append(f"   {k}  [{v['tipo']}, semente {v['seed']}]  {v['text']}   -> {v['mp3']}")
            if e.get("ja_aprovada"):
                idx.append(f"   (ja aprovada antes: {e['ja_aprovada']['variante']} -> {e['ja_aprovada']['text']})")
            idx.append("")
        idx.append(f"Gerado em {secs:.0f} s ({len(jobs)} variantes).")
        (d / "indice.txt").write_text("\n".join(idx) + "\n")
        print(d); print(f"{len(meta)} frases, {len(jobs)} variantes, {secs:.0f} s")
        return

    if a.cmd == "apply":
        d = Path(a.review).expanduser(); esc = json.loads((d / "escolhas.json").read_text()); n = 0
        for e in esc["frases"]:
            k = (e.get("escolha") or "").strip().upper()
            if not k:
                continue
            v = e["variantes"][k]
            rec = {"text": v["text"], "seed": v["seed"], "variante": k, "tipo": v["tipo"], "origem": e["original"],
                   "video": esc.get("video"), "data": datetime.date.today().isoformat()}
            k2 = (e.get("segunda") or "").strip().upper()          # 2.a preferencia (opcional), guardada como alternativa
            if k2 and k2 in e["variantes"]:
                v2 = e["variantes"][k2]; rec["segunda"] = {"text": v2["text"], "seed": v2["seed"], "variante": k2, "tipo": v2["tipo"]}
            corr["frases"][norm_key(e["original"])] = rec
            corr["frases"][norm_key(v["text"])] = rec          # o texto final tambem resolve para si proprio
            if v["tipo"] == "reformulacao":
                for w in e["homografos"]:
                    for a_, b_ in hom[w].get("reformular", []):
                        if replace_word(e["original"], a_, b_) == v["text"]:
                            corr["palavras"][w] = b_
            n += 1
        (pack / "correcoes.json").write_text(json.dumps(corr, ensure_ascii=False, indent=1))
        print(f"{n} escolhas gravadas em {pack / 'correcoes.json'}")


if __name__ == "__main__":
    main()
