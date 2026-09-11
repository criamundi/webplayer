# Top TV Digital 0.7.34 — Samsung TV UX Foundation

## Objetivo
A versão Web/Bolt continua com o visual atual. Esta versão adiciona uma camada específica para Samsung/Tizen, inspirada na mecânica de navegação de grandes apps de streaming (sem copiar identidade visual).

## Samsung / Tizen
- foco remoto sempre visível, independente de hover;
- navegação espacial mais previsível por linha/coluna;
- Enter executa o item focado e Return continua voltando;
- foco inicial prioriza a ação principal do Hero;
- menu lateral compacto expande ao receber foco;
- fontes e áreas clicáveis maiores para leitura a distância;
- cards ganham zoom e contraste somente quando focados;
- efeitos pesados/translúcidos reduzidos no Tizen;
- widget esportivo recebe superfícies sólidas para evitar blocos claros no runtime Tizen;
- scroll de trilhos é automático e alinhado ao item focado.

## Identificação automática da TV
- carrega Samsung ProductInfo API no pacote Tizen;
- lê automaticamente o DUID oficial via `webapis.productinfo.getDuid()`;
- lê modelo/model code/firmware quando disponíveis;
- registra/atualiza a TV no Supabase após a lista ser validada;
- heartbeat a cada 10 minutos enquanto o app estiver aberto;
- Admin exibe DUID, plataforma, versão do app e último acesso por linha.

## Backend necessário
Aplicar migration:
`supabase/migrations/20260910223000_tv_device_installations.sql`

Deploy da Edge Function:
`register-tv-device`

O build Web/Bolt não depende das APIs Samsung.
