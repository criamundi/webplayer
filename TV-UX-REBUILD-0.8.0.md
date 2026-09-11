# Reconstrução da experiência de TV — versão 0.8.0

## Resumo executivo

O problema principal não era o React nem a necessidade de recomeçar todo o produto. A lentidão vinha da camada de TV: cada toque no controle remoto percorria e media praticamente todos os elementos interativos da página, o player Samsung usava a mesma pilha JavaScript/MSE do navegador, todas as telas entravam no pacote inicial e os catálogos podiam manter capas demais no DOM.

A versão 0.8.0 preserva o backend, o painel, o Web/Bolt e a identidade já configurada, mas troca os componentes críticos da experiência de TV:

- motor de foco determinístico e cacheado;
- player nativo Samsung AVPlay com preparação assíncrona;
- carregamento sob demanda de telas e do player;
- paginação de catálogos com no máximo 20 capas por página na TV;
- menu lateral sobreposto, sem deslocar todo o layout;
- Home mais cinematográfica, simples e previsível;
- redução de blur, sombras, contornos decorativos e camadas de GPU;
- navegação por linhas e grades explicitamente declaradas;
- tratamento de repetição rápida do controle e conflitos entre atalhos globais e locais.

O objetivo não é copiar visualmente a Netflix, mas aplicar o modelo mental que funciona em TV: Hero com ação clara, trilhos horizontais, menu lateral persistente, foco único e resposta imediata.

## Pesquisa e decisão técnica

A documentação oficial da Samsung trata a TV como um ambiente diferente de desktop e celular: a interface deve ser compreensível à distância, o foco precisa ser óbvio, e todas as funções devem ser alcançáveis pelas quatro direções e pelo botão central.[^1][^2] Ela também recomenda minimizar o código da Home, adiar módulos não necessários e carregá-los sob demanda. A própria Samsung usa aproximadamente 5–7 segundos como referência de lançamento que ainda satisfaz a maioria dos usuários.[^3]

Para vídeo adaptativo, formatos adicionais e reprodução robusta, a Samsung recomenda AVPlay e documenta `prepareAsync()` para que a preparação não bloqueie a interface.[^4] Por isso a Samsung passa a usar o player nativo; Web/Bolt continua com HLS.js/MPEG-TS como fallback.

A documentação de memória alerta que imagens costumam ser o maior consumo de aplicações de TV, recomenda limitar o número de elementos ativos, liberar telas anteriores e virtualizar listas grandes — especificamente citando que listas acima de aproximadamente 100 itens não devem permanecer inteiras no DOM.[^5] A versão 0.8.0 é mais conservadora e mostra somente 20 capas por página nos catálogos da TV.

React continua sendo uma escolha válida: a Samsung mantém um guia oficial para aplicações Tizen Web com React.[^6] Portanto, substituir todo o frontend por outra linguagem traria risco sem atacar as causas reais. A arquitetura adotada mantém React e separa a camada especializada de TV.

## Auditoria do código anterior

| Área | Evidência encontrada | Efeito na TV | Correção 0.8.0 |
|---|---|---|---|
| Controle remoto | `querySelectorAll`, `getComputedStyle` e `getBoundingClientRect` sobre todos os focáveis a cada seta | Reflow síncrono e atraso crescente | Mapa de foco cacheado, invalidado somente quando layout/DOM muda |
| Direções | Cálculo geométrico global para qualquer movimento | Foco imprevisível e custo proporcional à tela | Linhas, colunas e grades explícitas com busca geométrica apenas como fallback |
| Eventos | Listener global em fase de captura competia com player e tela Ao Vivo | Duplo tratamento ou tecla “presa” | Componentes recebem a tecla primeiro; motor global completa apenas o não tratado |
| Repetição | Toda repetição do controle era processada | Saltos e travamento ao segurar seta | Limite de repetição de 65 ms |
| Vídeo Samsung | HLS.js/MPEG-TS via JavaScript/MSE | Maior CPU, memória e buffering | AVPlay nativo, `prepareAsync`, hardware keys e fallback seguro |
| Abertura | Administração, canais, filmes, séries e player eram importados estaticamente | Mais download, parse e memória antes da Home | Divisão por rota com `lazy()` e `Suspense` |
| Catálogo | Crescimento contínuo das grades | Degradação depois de navegar por muito tempo | 20 capas por página na TV |
| Imagens/efeitos | Muitos blur, sombras, transparências e animações | Mais camadas de composição e memória gráfica | Superfícies sólidas e animações restritas a `transform`/`opacity` |
| Menu | Expansão visual podia competir com o conteúdo | Layout instável e navegação cansativa | Menu compacto que abre por cima da tela |
| Widget esportivo | Painel lateral montado na abertura | Trabalho e competição visual desnecessários | Na TV, só monta quando aberto |

O projeto também tinha `package.json` e lockfile fora de sincronia. A instalação reproduzível foi restaurada e as pendências existentes de lint/TypeScript foram zeradas.

## Arquitetura implementada

### Inicialização

Somente autenticação, dados essenciais, layout, Home e componentes realmente visíveis entram no caminho inicial. Administração, Ao Vivo, Filmes, Séries, Busca, Favoritos, Configurações e Player são chunks independentes. A compilação Tizen validada gerou um núcleo legado de aproximadamente 133 kB gzip; o player ficou em arquivo separado e só é carregado quando necessário.

Isso segue a orientação oficial de exibir a Home com o mínimo de código e carregar o restante sob demanda.[^3]

### Navegação

O novo motor usa três níveis:

1. ligação explícita `data-tv-up/down/left/right`, quando uma transição precisa ser exata;
2. navegação por eixo ou grade declarada, sem medir a tela inteira;
3. cálculo espacial cacheado somente como fallback entre regiões.

O cache é invalidado por mudanças reais no DOM, resize e scroll. O elemento focado anterior é rastreado diretamente, sem consultar toda a árvore. As linhas são horizontais, menus são verticais e catálogos têm cinco colunas na TV. Isso atende à exigência da Samsung de movimento previsível e manutenção do contexto de foco.[^1][^2]

### Player Samsung

Em uma Samsung com `webapis.avplay`, o aplicativo:

- resolve a URL do proxy existente;
- abre no AVPlay;
- configura a área de exibição;
- usa `prepareAsync()` com timeout de 25 segundos;
- mostra buffering e erros sem bloquear a tela;
- registra progresso de VOD;
- restaura o ponto assistido;
- trata Play/Pause, avanço e retrocesso do Smart Remote;
- encerra e fecha o player ao trocar de conteúdo.

Fora da Samsung, o player anterior permanece como fallback. Essa separação evita regressão no navegador e permite usar o decodificador nativo onde ele existe.[^4][^7]

### Memória e renderização

- Filmes e Séries: 20 capas por página na TV.
- Trilhos: dimensões estáveis e scroll imediato.
- Widget esportivo: desmontado quando fechado.
- Background decorativo global: removido na TV.
- Blur e filtros: removidos na TV.
- Foco: pequena escala apenas nas capas; botões usam troca sólida de cor.
- `will-change`: não fica permanentemente ativo.

Essas medidas atacam memória de imagem, quantidade de nós, custo de composição e o orçamento aproximado de 16 ms por quadro descrito nas recomendações da Samsung.[^5][^8]

## UX resultante

- A Home abre com Hero, ações principais e linhas de conteúdo.
- Ao focar uma capa de um trilho, o Hero pode pré-visualizar aquele título sem abrir outra tela.
- O menu lateral permanece compacto e abre por cima do conteúdo quando recebe foco.
- Existe um único estilo de foco forte e consistente.
- Botões deixam de depender de contornos decorativos; o estado focado usa a cor principal da marca.
- O painel de jogos não disputa espaço nem processamento na abertura.
- Ao Vivo mantém seus próprios atalhos e seleção protegida contra trocas em cascata.
- Catálogos deixam de crescer indefinidamente durante a sessão.

## Validação executada

| Verificação | Resultado |
|---|---|
| TypeScript (`npm run typecheck`) | Aprovado, zero erros |
| ESLint (`npm run lint`) | Aprovado, zero erros e zero avisos |
| Build Web (`npm run build`) | Aprovado |
| Build Samsung/Tizen legado (`npm run build:tizen`) | Aprovado |
| HTML Tizen legado, caminhos relativos e WebAPIs | Aprovado pelo script de preparação |
| Lockfile reproduzível | Restaurado |

## O que ainda precisa de teste físico

Emulador e build não reproduzem completamente decodificador, memória, firmware, rede e Smart Remote reais. Antes de distribuir para todos os clientes, é necessário um teste controlado em pelo menos uma Samsung Tizen real:

1. abrir o app a frio e medir até o primeiro foco utilizável;
2. navegar continuamente por 15–20 minutos;
3. alternar entre 20 canais;
4. reproduzir HLS, MPEG-TS e VOD disponíveis no provedor;
5. testar Play/Pause/Voltar e manter seta pressionada;
6. deixar o app aberto por uma hora e repetir a navegação;
7. suspender e retomar a aplicação;
8. confirmar que a TV libera o player ao trocar de canal.

Buffering causado pelo servidor de origem, bloqueio do provedor ou velocidade da VPS não pode ser eliminado apenas pelo frontend. A versão 0.8.0 reduz o custo local da TV e melhora a recuperação, mas a telemetria deve separar “interface lenta”, “proxy lento” e “origem lenta”.

## Critérios para a próxima rodada

- primeiro foco utilizável em até 5–7 s no teste a frio;
- resposta visual à seta perceptivelmente imediata, sem salto duplo;
- nenhum crescimento contínuo de capas no DOM;
- nenhuma tela preta durante erro do player;
- troca de canal cancelando corretamente a reprodução anterior;
- nenhuma perda de foco ao voltar de detalhes ou player;
- sessão de uma hora sem degradação progressiva.

## Fontes

[^1]: Samsung Developer, [Design Principles](https://developer.samsung.com/smarttv/design/design-principles.html).
[^2]: Samsung Developer, [Input Methods](https://developer.samsung.com/smarttv/design/input-methods.html) e [UX Checklist](https://developer.samsung.com/smarttv/design/ux-checklist.html).
[^3]: Samsung Developer, [Launch Time Optimization](https://developer.samsung.com/smarttv/develop/guides/application-performance-improvement/launch-time-optimization.html).
[^4]: Samsung Developer, [Playback Using AVPlay](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html).
[^5]: Samsung Developer, [Web App (HTML5) Memory Optimization Guide](https://developer.samsung.com/smarttv/develop/guides/web-app-memory-optimization-guide.html).
[^6]: Samsung Developer, [Developing a Tizen Web Application with the React Framework and Hot Module Replacement](https://developer.samsung.com/smarttv/develop/tools/webapp/webapp-guide.html).
[^7]: Samsung Developer, [Remote Control](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html).
[^8]: Samsung Developer, [Application Performance Improvement](https://developer.samsung.com/smarttv/develop/guides/application-performance-improvement/application-performance-improvement.html).
