# Top TV Digital — TV Foundation 0.7.3

Uma única base React/Vite atende Web, Samsung Tizen e LG webOS.

## O que já está preparado
- detecção automática Web/Tizen/webOS;
- registro de teclas extras no Tizen quando disponível;
- tecla Voltar unificada (Tizen 10009, LG 461, Escape/BrowserBack);
- navegação espacial por foco para setas do controle;
- foco visível especial em TV;
- abstração de fullscreen com fallback para browsers de TV;
- nome padrão Top TV Digital;
- scripts de build separados;
- templates iniciais de empacotamento Tizen e webOS.

## Builds
- `npm run build:web`
- `npm run build:tizen`
- `npm run build:webos`

Os templates em `platforms/` ainda precisam dos IDs/certificados oficiais e ícones finais antes de envio às lojas.
