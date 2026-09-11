# Top TV Digital 0.7.29 — compatibilidade Samsung Tizen

Base: 0.7.28 (auditoria geral TV).

Alterações desta versão:

- build Tizen separado do build Web;
- `@vitejs/plugin-legacy` 5.4.3 para Vite 5;
- alvo Tizen `chrome69`;
- `base: './'` apenas no modo Tizen;
- worker em formato `iife` no modo Tizen;
- pós-build automático remove scripts ES module do pacote Tizen e força a entrada legacy/SystemJS;
- `config.xml` é copiado automaticamente para `dist/` no `npm run build:tizen`;
- Package ID corrigido para `TopTV2026A`;
- Application ID `TopTV2026A.Player`;
- privilégios de internet e controle remoto Samsung declarados;
- acesso externo de rede liberado no `config.xml`;
- build Web e webOS continuam independentes das regras legacy do Tizen.

Importante: não editar manualmente `dist/index.html` depois do `npm run build:tizen`.
