# Nexus Play — Beta 0.1

Versão: `0.1.0-beta.1`

## Ajustes principais

- removido o `React.StrictMode` para impedir inicialização duplicada do player no preview do Bolt;
- encerramento explícito do stream anterior no proxy quando o navegador cancela a reprodução;
- intervalo de 1,2 segundo entre o encerramento de um canal e a abertura do próximo;
- tratamento de erro também para reprodução nativa do navegador;
- identificação visual da versão Beta 0.1;
- campo de conexões do Admin identificado como referência interna;
- diagnóstico compatível com `active_cons` e `max_connections` enviados como texto pela API Xtream.

## Publicação necessária

Depois de importar o projeto no Bolt/Supabase, publique novamente a função:

- `stream-proxy`

Sem republicar essa função, o cancelamento reforçado do stream não estará ativo no ambiente online.

## Observação sobre conexões

O valor **Conexões da linha (referência)** salvo no Admin do Nexus Play não modifica o limite real da conta no painel IPTV. O limite real continua sendo controlado pelo provedor.

Para testar uma linha de uma conexão, use somente o Web Player e mantenha outros aplicativos e TVs fechados.
