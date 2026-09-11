# Teste Samsung Tizen — Top TV Digital 0.7.33

## 1. Configure o backend antes do build
Crie, na raiz do projeto, o arquivo `.env.tizen.local`:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
VITE_APP_PLATFORM=tizen
```

Use os mesmos valores públicos do projeto Web/Bolt que já funciona. Não use `service_role`.

## 2. Instale e gere o build
```powershell
npm install
npm run build:tizen
```

O comando precisa terminar com:
`Tizen build prepared successfully: legacy-only HTML + classic worker + diagnostics + relative assets + config.xml.`

## 3. Empacote
```powershell
cd dist
& "C:\tizen-studio\tools\ide\bin\tizen.bat" package -t wgt -s TopTVDigital
```

## 4. Envie e instale na TV
```powershell
& "C:\tizen-studio\tools\sdb.exe" -s 192.168.1.66:26101 push "Top TV Digital.wgt" /home/owner/share/tmp/sdk_tools/TopTVDigital.wgt
& "C:\tizen-studio\tools\sdb.exe" -s 192.168.1.66:26101 shell 0 vd_appinstall TopTV2026A.Player /home/owner/share/tmp/sdk_tools/TopTVDigital.wgt
```

## 5. Abra
```powershell
& "C:\tizen-studio\tools\ide\bin\tizen.bat" run -s 192.168.1.66:26101 -p TopTV2026A.Player
```

Se houver erro JavaScript em runtime, esta versão mostra uma mensagem legível na própria TV em vez de ficar apenas preta.

## 0.7.34 — UX Samsung e identificação automática

Depois de atualizar para 0.7.34:

1. Aplique `supabase/migrations/20260910223000_tv_device_installations.sql`.
2. Faça deploy da Edge Function `register-tv-device`.
3. Rode `npm install` e `npm run build:tizen`.
4. Empacote/instale o `.wgt` como nos testes anteriores.

Ao abrir a lista com sucesso, a Samsung envia automaticamente ao Admin:
- DUID oficial da TV;
- modelo/model code;
- firmware quando disponível;
- versão do app;
- último acesso.

A versão Web/Bolt não usa APIs Samsung e mantém o visual normal.
