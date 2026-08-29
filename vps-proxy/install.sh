#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Execute com sudo: sudo bash install.sh" >&2
  exit 1
fi

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

command -v node >/dev/null || { echo "Node.js não instalado." >&2; exit 1; }
command -v nginx >/dev/null || { echo "Nginx não instalado." >&2; exit 1; }

install -d -o root -g root -m 0755 /opt/nexus-stream-proxy
install -o root -g root -m 0644 "$SCRIPT_DIR/server.mjs" /opt/nexus-stream-proxy/server.mjs
install -o root -g root -m 0644 "$SCRIPT_DIR/nexus-stream-proxy.service" /etc/systemd/system/nexus-stream-proxy.service
NGINX_SITE=/etc/nginx/sites-available/nexus-stream-proxy
if [[ -f "$NGINX_SITE" ]] && grep -qE 'listen[[:space:]]+443.*ssl' "$NGINX_SITE"; then
  echo "Configuração HTTPS existente preservada."
else
  install -o root -g root -m 0644 "$SCRIPT_DIR/nginx.conf" "$NGINX_SITE"
fi
ln -sfn /etc/nginx/sites-available/nexus-stream-proxy /etc/nginx/sites-enabled/nexus-stream-proxy
rm -f /etc/nginx/sites-enabled/default

if [[ ! -f /etc/nexus-stream-proxy.env ]]; then
  umask 077
  TOKEN=$(openssl rand -hex 32)
  {
    echo "HOST=127.0.0.1"
    echo "PORT=3000"
    echo "PROXY_TOKEN=$TOKEN"
    echo "ALLOWED_ORIGINS=*"
    echo "CONNECT_TIMEOUT_MS=20000"
    echo "SIGNED_URL_MAX_FUTURE_SECONDS=86400"
    echo "HLS_SIGNED_URL_TTL_SECONDS=43200"
  } > /etc/nexus-stream-proxy.env
fi

nginx -t
systemctl daemon-reload
systemctl enable --now nexus-stream-proxy
systemctl enable --now nginx
systemctl restart nexus-stream-proxy nginx

sleep 1
curl --fail --silent http://127.0.0.1:3000/health
echo
echo "Instalação concluída. O token está protegido em /etc/nexus-stream-proxy.env."

