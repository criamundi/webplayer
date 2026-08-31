# Recuperação da Home / Hero / Live

Esta atualização foi aplicada diretamente sobre o ZIP original enviado como base.

## Corrigido nesta etapa
- Hero não fixa mais em cache uma resposta incompleta quando a busca detalhada falha temporariamente.
- Logos do Hero podem voltar a ser buscadas em novas tentativas.
- Relógio atualizado a cada 15 segundos e visível diretamente na Home.
- Widget esportivo reduzido para uma largura compacta.
- Times aproximados e `VS` entre os escudos.
- `Onde assistir` faz novas tentativas quando os canais ainda não estavam disponíveis no primeiro carregamento.
- Botões principais Canais ao Vivo / Filmes / Séries sem contorno externo.
- Primeiras capas das vitrines usam carregamento prioritário; as demais continuam lazy.
- Ordem oficial de canais existente na base foi preservada, sem substituir a lógica atual do Live.

## Arquivos alterados
- src/components/views/HomeView.tsx
- src/components/home/FootballWidget.tsx
- src/components/layout/TopBar.tsx
- src/home.css

Nenhuma função de dispositivos foi incluída neste pacote; esta recuperação parte do ZIP original enviado.
