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

- Removida a referência ao secret `SPORTSDB_API_KEY`; TheSportsDB usa a chave pública de desenvolvimento já prevista pelo código.

- Widget esportivo: rotação aumentada para 15s, horário destacado, lista inferior refeita com linha única e VS, e larguras fixas para evitar deslocamento visual na troca de times.

- Widget esportivo: VS centralizado e porcentagens exibidas dentro de cada faixa da barra de probabilidades.

- Probabilidade: barra fina e percentuais ao lado dos nomes dos times e de Empate.

- Cabeçalho do widget: dia da semana em uma linha e dia/mês em outra.

- Hero restaurado ao fundo anterior. Widget esportivo convertido em card flutuante compacto, quase sólido, sem blur/degradê de ligação com o Hero.

- Widget sem contorno. Degradê lateral refeito com radiais nas pontas e menor intensidade no centro para eliminar o padrão vertical seco.

- Segurança de acesso: cache local não abre mais o player sem validação atual da linha. Falha/bloqueio mostra tela própria com Recarregar e Alterar dados da lista.

- Menu: Busca e Continuar assistindo removidos. Configurações sem TopBar e com dados da conta (login, status, usuário, senha e validade).

- Canais ao Vivo: Últimos assistidos removido; cabeçalho/rodapé do player removidos; player com cantos retos; programação completa do dia listada abaixo do vídeo.

- Proteção contra desconexões: validações upstream auxiliares cacheadas por 60s; account-status/playlist continuam sempre frescos; EPG reduzido de 3 para 10 min; troca de canal ganhou intervalo maior para liberar a conexão anterior.

- DNS: removida a configuração de DNS padrão do provedor. connect-line agora testa os DNS ativos vinculados ao provedor, identifica automaticamente qual autentica a lista e grava esse dns_id na linha. server_url/default_dns_id deixaram de participar da conexão.

- Admin provedor: removidos definitivamente DNS padrão/URL de servidor da edição; nova RPC de configurações sem parâmetros legados; exclusão de provedor passa por RPC Super Admin que limpa linhas, bouquets, branding, DNS e vínculos de perfis.

- Permissões finais de provedores: Super Admin cria/edita/ativa/exclui; Provider Admin altera somente Cadastro automático do próprio provedor.

- Renovação individual: iptv_lines ganhou renewal_url; Admin Dispositivos permite salvar o checkout por lista; account-status retorna primeiro o link da linha e usa o link do provedor apenas como fallback.

- Login 0.5.2: descoberta de DNS agora tenta HTTP/HTTPS quando o host não possui protocolo, usa timeout individual de 6,5s por tentativa e segue para o próximo DNS em caso de falha. Status Xtream vazio/Enabled autenticado também é aceito como ativo quando não vencido.

- 0.5.3: Backspace deixou de ser tratado como botão Voltar global; campos de login/admin voltam a apagar texto normalmente.

- 0.5.4: corrigido RPC de Cadastro automático. Perfis provider_admin com admin_active NULL agora seguem a mesma regra do login Admin (somente false bloqueia). Erros RPC agora aparecem com mensagem real no modal.
