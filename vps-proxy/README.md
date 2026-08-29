# Nexus Play Stream Proxy

Proxy leve para a VPS do Nexus Play. Repassa streams HTTP/HTTPS sem transcodificação, preserva `Range`, reescreve manifestos HLS e encerra o upstream quando o player fecha ou troca de canal.

## Instalação no Ubuntu 24.04

```bash
sudo apt update
sudo apt install -y nodejs nginx git
git clone https://github.com/criamundi/webplayer.git
cd webplayer/vps-proxy
sudo bash install.sh
```

Teste local:

```bash
curl http://127.0.0.1:3000/health
```

O serviço escuta apenas em `127.0.0.1:3000`; o Nginx publica `/health` e `/stream` na porta 80. O token é criado automaticamente em `/etc/nexus-stream-proxy.env` com permissão restrita.

O endpoint também aceita URLs temporárias assinadas com HMAC-SHA256. A Edge
Function usa o mesmo `PROXY_TOKEN` para gerar a assinatura, sem enviar o token
ao navegador.

Antes de produção, configure `ALLOWED_ORIGINS` com os domínios do frontend e habilite HTTPS no Nginx.
