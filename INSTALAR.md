# Instalar o media-stack numa VM (guia para sysadmin)

Para quem nao conhece o projecto. **Se algo falhar, pare e reporte (seccao 10); nao improvise.**

## 1. O que e
Servico interno que gera videos (Reels 9:16, apresentacoes) a partir de um pedido JSON: voz (fal.ai Eleven v3, com fallback local), imagens/videos de stock (Pexels), musica e efeitos gerados localmente, legendas e render (HyperFrames/Chromium). 8 contentores em Docker Compose. Nao tem interface web. Quem o chama e uma app cliente, com pedidos assinados.

## 2. Requisitos da VM
- Debian 12 ou Ubuntu 22.04/24.04, **amd64**, sem GPU.
- Perfil recomendado: 16 vCPU, 32 GB RAM, 400 GB SSD/NVMe. Minimo: 8 vCPU, 16 GB, 200 GB.
- Docker Engine 24+ e plugin `docker compose` v2 (`docker compose version`).
- Uma rede privada/VPN (ex. WireGuard ou Tailscale) para aceder a API; ela nao e publica.
- Saida HTTPS para: `fal.run`, `queue.fal.run`, `api.pexels.com`, `images.pexels.com`, `videos.pexels.com`, `huggingface.co` (modelos, so na 1a vez).
- Se faltar Docker: seguir https://docs.docker.com/engine/install/ (debian ou ubuntu) e adicionar o utilizador ao grupo `docker`.

## 3. Obter o codigo
```bash
sudo mkdir -p /opt/media-stack && sudo chown $USER /opt/media-stack
git clone https://github.com/digitaldev-lx/media-stack /opt/media-stack && cd /opt/media-stack
git checkout v1.0.0
```

## 4. Segredos (.env)
```bash
cp .env.example .env && chmod 600 .env
# Preencher num editor local: MEDIA_HMAC_SECRET (openssl rand -hex 32), FAL_KEY, PEXELS_API_KEY, BIND_IP, FAL_VOICE.
# Confirmar so que existem (sem mostrar valores):
for v in FAL_KEY PEXELS_API_KEY MEDIA_HMAC_SECRET; do grep -q "^$v=.\+" .env && echo "$v ok" || echo "$v VAZIA"; done
```
Nunca `cat .env`, nunca em logs/historico/chat, nunca commitar. O consumo da voz e facturado na conta fal.ai da chave usada; use uma chave dedicada e os tectos `FAL_MAX_USD_PER_JOB`/`_PER_DAY`.

## 5. Build, modelos, arranque
```bash
cd /opt/media-stack
docker compose build                                              # 5-15 min
docker compose --profile tools run --rm models piper_pt whisper_base   # ~0,25 GB para o volume
docker compose up -d
docker compose ps                                                  # todos "healthy" (gateway demora ~30 s)
```

## 6. Firewall
A API escuta em `${BIND_IP}:8080` (nunca `0.0.0.0`). Nenhuma outra porta e publicada.
```bash
sudo ufw default deny incoming && sudo ufw allow OpenSSH && sudo ufw allow in on <interface-vpn> to any port 8080 proto tcp
sudo ufw enable && sudo ufw status
ss -tlnp | grep 8080          # so deve mostrar o IP da VPN ou 127.0.0.1
```
Nota: o Docker contorna o ufw para portas publicadas; por isso o compose publica so no IP da VPN. Confirme com `ss`.

## 7. Testar
```bash
set -a; . ./.env; set +a                                  # carrega MEDIA_HMAC_SECRET no shell (sem o imprimir)
curl -s http://$BIND_IP:8080/health                  # {"ok":true}
scripts/smoke.sh scripts/example-reel-pt-local.json /tmp/teste-local.mp4 http://$BIND_IP:8080   # sem chaves, Piper
scripts/smoke.sh scripts/example-reel-pt.json /tmp/teste-fal-pexels.mp4 http://$BIND_IP:8080   # voz Eleven v3 + Pexels
```
O 2.o teste so passa com `FAL_KEY` e `PEXELS_API_KEY` validas. Deve imprimir `QA: True`, `fal_usd` > 0 e **sem** avisos de fallback. Se aparecer "voz fal indisponivel", reportar o texto do aviso (nao contem a chave).
Para ouvir o sotaque: copiar o MP4 (`scp`) e reproduzir; validar a voz (`FAL_VOICE`) de ouvido.

## 8. Operacao
```bash
docker compose logs -f gateway            # ou render-hyperframes, tts-local, ...
docker compose ps
docker compose restart gateway
```
- **Actualizar:** receber novo tar, `tar xzf ... --strip-components=1` (o `.env` e os volumes mantem-se), `docker compose build && docker compose up -d`.
- **Backup:** o volume `media-stack_state` (estado dos jobs e gasto diario) — `docker run --rm -v media-stack_state:/s -v $PWD:/b alpine tar czf /b/state-$(date +%F).tgz -C /s .`. Os volumes `work` (temporarios, apagados a 48 h) e `models` (re-descarregavel) nao precisam de backup. Guardar o `.env` num gestor de segredos, nao no backup.
- **Disco:** `docker system df`; `/work` limpa-se sozinho (`JOB_TTL_HOURS`).
- **Rodar segredos:** alterar o `.env` e `docker compose up -d` (recria o gateway).

## 9. Checklist de aceitacao
- [ ] `docker compose ps`: 7 servicos `healthy` (o `models` nao corre).
- [ ] `ss -tlnp | grep 8080` so mostra IP da VPN/127.0.0.1; nenhuma porta publica nova.
- [ ] Pedido com assinatura invalida devolve 401: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://$BIND_IP:8080/v1/jobs -H 'content-type: application/json' -d '{}'`
- [ ] `smoke.sh` local: `QA: True`, MP4 1080x1920 com audio.
- [ ] `smoke.sh` fal+Pexels: `QA: True`, `fal_usd` > 0, sem avisos de fallback; `assets.json` com fotografo/URL (ver `docker compose exec gateway ls /work`).
- [ ] Repetir o mesmo pedido com a mesma `IDEMPOTENCY_KEY` devolve o mesmo `id` (`deduplicated`).
- [ ] `.env` com permissoes 600 e fora de qualquer repo/backup; nenhum segredo em `docker compose logs`.
- [ ] Reiniciar a VM: `docker compose ps` volta a `healthy` sozinho.

## 10. Se algo falhar
Pare, copie os outputs reais (comando + erro, sem segredos) e reporte ao responsavel pela instalacao. **Nao**: mudar a arquitectura, desactivar a verificacao HMAC, abrir portas ou publicar a API na Internet para "fazer funcionar".
