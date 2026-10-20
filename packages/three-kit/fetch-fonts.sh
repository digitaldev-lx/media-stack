#!/bin/sh
# Descarrega as fontes usadas pelo demo e pelo template (SIL Open Font License) para fonts/.
# O troika-three-text le .woff/.ttf; o CSS usa .woff2.
set -e
cd "$(dirname "$0")"; mkdir -p fonts
B=https://cdn.jsdelivr.net/fontsource/fonts
for w in 500 800 900; do
  curl -sfL -o fonts/inter-$w.woff  $B/inter@latest/latin-$w-normal.woff
  curl -sfL -o fonts/inter-$w.woff2 $B/inter@latest/latin-$w-normal.woff2
done
curl -sfL -o fonts/jbmono-700.woff  $B/jetbrains-mono@latest/latin-700-normal.woff
curl -sfL -o fonts/jbmono-700.woff2 $B/jetbrains-mono@latest/latin-700-normal.woff2
ls -1 fonts
