#!/usr/bin/env python3
"""Detector de tracos pt-BR, v3: alinhado ao texto (eSpeak pt = europeu -> fonemas esperados -> alinhamento CTC forcado).

Modelo: facebook/wav2vec2-xlsr-53-espeak-cv-ft (Apache-2.0). eSpeak NG (GPL, usado so como programa externo).
Para cada fonema ESPERADO em PT-PT olha para os fotogramas onde ele foi alinhado e mede a probabilidade do que se ouviu:

  palat_max  [dʒ tʃ] / ([d t] + [dʒ tʃ]) no pior d/t antes de [i j ɨ]   (pedido, sitio, dia, tipo, decidir, -de)  -> baixo
  aberto     [a] / ([a] + [ɐ ə]) media nas vogais que em PT-PT sao [ɐ] reduzido (o 2.o a de "cada", "partida")  -> baixo
  e_cheio    [e ɛ] / ([e ɛ] + [ɨ ə i ɪ]) nas vogais que em PT-PT sao [ɨ] (de, pode, decidir)                    -> baixo
  lenis      [ð] / ([d] + [ð]) nos d entre vogais (PT-PT "cada" = [ˈkaðɐ])                                       -> alto
  muda_ab    [a] / ([a] + [ɐ ə]) no a das palavras com consoante muda historica (fatura, acao, atual)           -> alto
  sil_s      silabas por segundo de fala (sem pausas)  ·  pausa  fraccao de silencio entre palavras
Uso:  python sotaque.py "texto" a.wav ... [--gate]  |  --pairs pares.json ([[texto, wav, (inicio, fim)], ...]) [--gate]
      --gate: aplica os LIMIARES ao conjunto e sai com 2 se nao passar (nada sai sem passar).
"""
import json
import re
import subprocess
import sys
import unicodedata
import warnings

warnings.filterwarnings("ignore")
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402
import torchaudio  # noqa: E402
from huggingface_hub import hf_hub_download  # noqa: E402
from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC  # noqa: E402

M = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
fe = Wav2Vec2FeatureExtractor.from_pretrained(M)
TOK = json.load(open(hf_hub_download(M, "vocab.json")))
VOC = {v: k for k, v in TOK.items()}
model = Wav2Vec2ForCTC.from_pretrained(M).eval()


def ids(*names):
    return [TOK[n] for n in names if n in TOK]


AFF = ids("dʒ", "tʃ", "tʃʲ", "tʃː", "tʃʰ", "dʒʲ", "dʒː")
STOP = ids("d", "t", "dʲ", "tʲ", "d̪", "t̪")
HIGH_I = ids("i", "iː", "ɪ", "j", "ɨ", "ɨː", "iə")
A_OPEN = ids("a", "aː", "ɑ", "ɑː", "æ")
A_RED = ids("ɐ", "ə", "ɐɐ", "ɜ")
D_ = ids("d", "dʲ", "d̪")
DH = ids("ð")
SKIP = {"<pad>", "<s>", "</s>", "<unk>", "|", ""}


def load16(path, start=None, end=None):
    x, sr = sf.read(path, dtype="float32")
    x = x.mean(1) if x.ndim > 1 else x
    if start is not None:
        x = x[int(start * sr):int(end * sr)]
    t = torch.tensor(x)
    if sr != 16000:
        t = torchaudio.functional.resample(t, sr, 16000)
    return t.numpy()


def posteriors(x):
    with torch.no_grad():
        lg = model(fe(x, sampling_rate=16000, return_tensors="pt").input_values).logits[0]
    return torch.softmax(lg, -1).numpy()          # [fotogramas, vocab], 20 ms por fotograma


def greedy(P):
    out, prev = [], None
    for i in P.argmax(-1):
        if i != prev and VOC.get(int(i), "") not in SKIP:
            out.append(VOC[int(i)])
        prev = i
    return " ".join(out)


def regions(mass, thr=0.3):
    """Zonas contiguas de fotogramas onde a massa de um grupo passa o limiar."""
    on = mass > thr
    r, s = [], None
    for i, v in enumerate(on):
        if v and s is None:
            s = i
        if not v and s is not None:
            r.append((s, i)); s = None
    if s is not None:
        r.append((s, len(on)))
    return r


def syllables(text):
    t = re.sub(r"[^a-záàâãéêíóôõúüç ]", " ", text.lower())
    return sum(max(1, len(re.findall(r"[aeiouáàâãéêíóôõúü]+", w))) for w in t.split())


def speech_time(x, frame=0.02, gap=0.06):
    """Tempo de fala (s) e fraccao de pausa entre a primeira e a ultima zona com voz."""
    hop = int(16000 * frame)
    e = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2) + 1e-12) for i in range(0, max(1, len(x) - hop), hop)])
    db = 20 * np.log10(e + 1e-9)
    voiced = db > (db.max() - 35)
    idx = np.where(voiced)[0]
    if len(idx) == 0:
        return 0.0, 0.0
    a, b = idx[0], idx[-1] + 1
    pause, run = 0, 0
    for v in voiced[a:b]:
        if not v:
            run += 1
        else:
            if run * frame > gap:
                pause += run
            run = 0
    tot = (b - a) * frame
    return tot - pause * frame, pause * frame / max(tot, 1e-6)



BLANK = TOK["<pad>"]
KEYS = sorted([k for k in TOK if k not in SKIP], key=len, reverse=True)
I = ids

OPEN, RED = I("a", "aː", "ɑ", "ɑː", "æ"), I("ɐ", "ə", "ɐɐ", "ɜ")
E_FULL, E_RED = I("e", "eː", "ɛ", "ɛː", "eɪ"), I("ɨ", "ɨː", "ə", "i", "ɪ")
VOWELS = set("aeiouɐəɨɛɔʊɪɑæ")

# palavras com consoante muda historica (pre-AO90): a vogal antes dela e ABERTA em PT-PT
MUDAS = {"fatura", "faturas", "faturação", "faturar", "ação", "ações", "acionar", "direção", "direções", "diretor",
         "diretora", "ótimo", "atual", "atuais", "atualizar", "atualmente", "coletivo", "coletiva", "ativo", "ativa",
         "atividade", "atividades", "objetivo", "objetivos", "seleção", "selecionar", "receção", "rececionista",
         "afetar", "afetado", "espetador", "letivo", "inspeção", "proteção", "correção", "exceção"}


def ipa_word(w):
    out = subprocess.run(["espeak-ng", "-v", "pt", "-q", "--ipa"], input=w, capture_output=True, text=True).stdout
    return unicodedata.normalize("NFC", out.replace("‍", "").strip())


def tokenize_ipa(s):
    """Divide a string IPA em tokens do vocabulario (maior correspondencia), guardando a tonicidade."""
    toks, i, stress = [], 0, False
    while i < len(s):
        c = s[i]
        if c in "ˈˌ":
            stress = c == "ˈ"; i += 1; continue
        if c in " _-":
            i += 1; continue
        for k in KEYS:
            if s.startswith(k, i):
                toks.append((k, stress if any(ch in VOWELS for ch in k) else None)); i += len(k)
                if any(ch in VOWELS for ch in k):
                    stress = False
                break
        else:
            i += 1
    return toks


def expected(text):
    words = re.findall(r"[\wáàâãéêíóôõúüç]+", text.lower())
    seq = []   # (token, tonica, idx_palavra, palavra)
    for wi, w in enumerate(words):
        for t, st in tokenize_ipa(ipa_word(w)):
            seq.append((t, st, wi, w))
    return seq


def align(P, seq):
    lp = torch.log(torch.tensor(P) + 1e-9)[None]
    tg = torch.tensor([[TOK[t] for t, *_ in seq]], dtype=torch.int32)
    ali, _ = torchaudio.functional.forced_align(lp, tg, blank=BLANK)
    ali = ali[0].tolist()
    spans, k, prev = [[] for _ in seq], -1, BLANK
    for f, a in enumerate(ali):
        if a != BLANK and (a != prev or prev == BLANK):
            k += 1
        if a != BLANK and k < len(seq):
            spans[k].append(f)
        prev = a
    return spans


def ratio(P, frames, num, den, pad=0):
    if not frames:
        return None
    a, b = max(0, frames[0] - pad), min(len(P), frames[-1] + 1 + pad)
    n, d = P[a:b, num].sum(), P[a:b, den].sum()
    return float(n / (n + d + 1e-9))


def score_x(text, x):
    P = posteriors(x)
    seq = expected(text)
    spans = align(P, seq)
    pal, ab, ec, le, mu, det, seen_mu = [], [], [], [], [], [], set()
    for j, ((t, st, wi, w), fr) in enumerate(zip(seq, spans)):
        nxt = seq[j + 1][0] if j + 1 < len(seq) else ""
        prv = seq[j - 1][0] if j > 0 else ""
        if t in ("d", "t") and nxt[:1] in ("i", "j", "ɨ") and prv[-1:] not in ("ʃ", "s", "ʒ", "z"):   # "-ísticas": ʃt confunde-se com tʃ
            v = ratio(P, fr, AFF, STOP, pad=2); pal.append(v); det.append((w, t + nxt, "palat", v))
        if t == "ɐ" and w not in MUDAS:
            v = ratio(P, fr, OPEN, RED); ab.append(v); det.append((w, t, "aberto", v))
        if t == "ɨ":
            v = ratio(P, fr, E_FULL, E_RED); ec.append(v); det.append((w, t, "e_cheio", v))
        if t == "d" and prv[-1:] in VOWELS and nxt[:1] in VOWELS:
            v = ratio(P, fr, DH, D_); le.append(v); det.append((w, t, "lenis", v))
        if w in MUDAS and t in ("ɐ", "a", "ɑ") and wi not in seen_mu:
            # primeira vogal "a" da palavra (a que fica antes da consoante muda na grafia antiga)
            seen_mu.add(wi)
            v = ratio(P, fr, OPEN, RED); mu.append(v); det.append((w, t, "muda_ab", v))
    st_, pfrac = speech_time(x)

    def m(v, f=np.mean):
        v = [a for a in v if a is not None]
        return round(float(f(v)), 3) if v else None
    return {"palat_max": m(pal, np.max), "palat": m(pal), "aberto": m(ab), "e_cheio": m(ec), "lenis": m(le),
            "muda_ab": m(mu), "sil_s": round(syllables(text) / st_, 2) if st_ else None, "pausa": round(pfrac, 3),
            "dur": round(len(x) / 16000, 2), "detalhe": [(a, b, c, None if d is None else round(d, 3)) for a, b, c, d in det],
            "fonemas": greedy(P)}


def score(text, path, start=None, end=None):
    return score_x(text, load16(path, start, end))


# Limiares calibrados (2026-10-22) contra a voz real do dono do pack (49 segmentos PT-PT), Joana (PT-PT) e Luciana (pt-BR):
#   palat por token antes de [i j]: voz real max 0.018 · Joana 0.058 · Luciana 0.94-0.98 · clone rejeitado ate 0.53
#   lenis medio: voz real 0.24 · Joana 0.24 · Luciana 0.06 · clone rejeitado 0.07
LIMIARES = {"palat_tok_max": 0.05, "lenis_min": 0.15, "muda_ab_min": 0.5, "sil_s": (5.6, 7.0)}


def veredicto(rows, lim=LIMIARES):
    """Junta varias frases (a mesma voz) e diz se passa. rows = saidas de score()."""
    pal = [(w, v) for r in rows for w, ph, k, v in r["detalhe"] if k == "palat" and ph[-1] in "ij" and v is not None]
    le = [v for r in rows for w, ph, k, v in r["detalhe"] if k == "lenis" and v is not None]
    mu = [v for r in rows for w, ph, k, v in r["detalhe"] if k == "muda_ab" and v is not None]
    ss = [r["sil_s"] for r in rows if r["sil_s"]]
    m = lambda v: round(sum(v) / len(v), 3) if v else None  # noqa: E731
    out = {"palat_tok_max": round(max([v for _, v in pal], default=0), 3),
           "palat_falhas": [f"{w}={round(v, 3)}" for w, v in pal if v > lim["palat_tok_max"]],
           "lenis": m(le), "muda_ab": m(mu), "sil_s": m(ss)}
    out["passa"] = {"palat": not out["palat_falhas"], "lenis": (out["lenis"] or 0) >= lim["lenis_min"],
                    "muda": out["muda_ab"] is None or out["muda_ab"] >= lim["muda_ab_min"],
                    "ritmo": out["sil_s"] is None or lim["sil_s"][0] <= out["sil_s"] <= lim["sil_s"][1]}
    out["passa"] = {k: bool(v) for k, v in out["passa"].items()}
    out["PASSA"] = all(out["passa"].values())
    return out


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--gate"]
    pairs = json.load(open(args[1])) if args[0] == "--pairs" else [[args[0], f] for f in args[1:]]
    rows = []
    for p in pairs:
        r = score(p[0], p[1], *(p[2:4] if len(p) >= 4 else (None, None)))
        rows.append(r)
        print(json.dumps({"file": p[1].split("/")[-1], **{k: v for k, v in r.items() if k not in ("fonemas", "detalhe")}}, ensure_ascii=False))
        print("   ", r["detalhe"])
    if "--gate" in sys.argv:
        v = veredicto(rows)
        print(json.dumps({"VEREDICTO": v}, ensure_ascii=False))
        sys.exit(0 if v["PASSA"] else 2)
