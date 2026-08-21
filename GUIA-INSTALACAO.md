# Instalação simples — Nexus Play Beta 0.1

Você não precisa usar o terminal do Bolt para instalar o banco.

## Parte 1 — Criar o banco

1. Entre em https://supabase.com/dashboard.
2. Abra o seu projeto novo.
3. No menu esquerdo, clique em **SQL Editor**.
4. Clique em **New query**.
5. Abra o arquivo `supabase/INSTALAR-BANCO-BETA-0.1.sql` deste projeto.
6. Copie todo o conteúdo do arquivo.
7. Cole no SQL Editor.
8. Clique em **Run**.

Ao terminar, o resultado deve mostrar estas seis tabelas:

- `app_branding`
- `iptv_bouquets`
- `iptv_dns`
- `iptv_lines`
- `iptv_providers`
- `profiles`

Se aparecer uma mensagem vermelha, não execute novamente várias vezes. Copie a mensagem completa para verificarmos.

## Parte 2 — Conectar o site ao Supabase novo

No Supabase:

1. Abra **Project Settings**.
2. Entre em **API**.
3. Copie a **Project URL** e a chave **anon/public**.

No arquivo `.env` do projeto, deixe:

```env
VITE_SUPABASE_URL=COLE_A_PROJECT_URL
VITE_SUPABASE_ANON_KEY=COLE_A_CHAVE_ANON_PUBLIC
```

Nunca coloque a chave `service_role` no arquivo `.env` do site.

## Parte 3 — Criar o primeiro administrador

1. Termine primeiro a Parte 1.
2. Abra o Nexus Play.
3. Crie a primeira conta.

A primeira conta criada depois da instalação do banco recebe automaticamente o perfil de administrador.

## Parte 4 — Funções do servidor

As funções estão em `supabase/functions`. Elas podem ser publicadas pelo painel conectado do Bolt, pelo painel do Supabase ou pela automação opcional do GitHub incluída no projeto.

Funções esperadas:

- `connect-line`
- `stream-proxy`
- `fetch-playlist`
- `provider-playlist`
- `conn-diagnostic`

## Automação opcional pelo GitHub

O arquivo `.github/workflows/deploy-supabase.yml` adiciona o botão manual **Deploy Supabase** no GitHub.

Antes de usar esse botão, abra no GitHub **Settings → Secrets and variables → Actions** e crie estes três segredos:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`

Depois abra **Actions → Deploy Supabase → Run workflow**. Essa etapa é opcional; para começar, use o SQL Editor descrito na Parte 1.
