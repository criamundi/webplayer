# Top TV Digital 0.7.33 — Bolt worker + Tizen worker fix

- Corrige o erro do Bolt `Vite is unable to parse the worker options as the value is not static`.
- Remove a opção dinâmica do construtor `Worker` em `src/lib/m3u.ts`.
- Web/Bolt usa `src/lib/m3uWorker.ts` com `{ type: 'module' }` estático.
- Tizen usa `src/lib/m3uWorker.tizen.ts` via alias exclusivo em `vite.tizen.config.ts`, com Worker clássico.
- Mantém `vite.config.ts` limpo para Preview do Bolt.
- Mantém o build Tizen legacy separado.
- Versão atualizada para 0.7.33.
