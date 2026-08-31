# Atualização manual — controle real de dispositivos

Base: ZIP completo enviado pelo usuário.

## O que mudou
- `Clientes` agora representa as linhas/contas IPTV.
- `Dispositivos` representa TVs, celulares e navegadores reais.
- Cada navegador/TV recebe um `device_id` persistente.
- O `connect-line` registra e valida o dispositivo.
- Dispositivo bloqueado não acessa o player.
- Limite por provedor (padrão: 2 dispositivos por cliente).
- Admin do provedor pode alterar o limite de 1 a 20.
- Admin pode liberar, bloquear ou remover dispositivos.
- RLS mantém isolamento entre provedores.

## Arquivos principais alterados/adicionados
- src/lib/provider.ts
- src/components/admin/AdminShell.tsx
- src/components/admin/LinesView.tsx
- src/components/admin/ProvidersView.tsx
- src/components/admin/DevicesView.tsx (novo)
- supabase/functions/connect-line/index.ts
- supabase/migrations/20260830231000_client_devices.sql (novo)

## Depois de enviar ao GitHub
A migration nova precisa ser aplicada no Supabase e a função `connect-line` precisa ser redeployada.
O workflow do repositório pode fazer isso automaticamente caso esteja configurado para migrations/Edge Functions.

## Validação
A estrutura e os arquivos foram conferidos sobre o ZIP completo recebido.
O build local não pôde ser concluído neste ambiente porque as dependências `node_modules` não vieram no ZIP.
