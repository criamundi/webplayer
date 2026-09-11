# Top TV Digital 0.7.32

Correção de integração Bolt + Samsung Tizen.

- Separado o `vite.config.ts` usado por Web/Bolt da configuração exclusiva da TV.
- Criado `vite.tizen.config.ts` para o build legacy da Samsung.
- `npm run dev` não carrega mais `@vitejs/plugin-legacy`.
- Corrigida a criação do `Worker` M3U: cada chamada agora usa opções estáticas, evitando o erro do Vite `worker-import-meta-url` no Bolt.
- Mantido `@vitejs/plugin-legacy@5.4.3` em `devDependencies` e no lockfile para o build Tizen.
- `build:tizen` passa a usar explicitamente `vite.tizen.config.ts`.
- Versão do app e do `config.xml` atualizada para 0.7.32.

Objetivo: o mesmo projeto deve abrir normalmente no Bolt/Web e continuar gerando o pacote Tizen legacy para a TV Samsung.
