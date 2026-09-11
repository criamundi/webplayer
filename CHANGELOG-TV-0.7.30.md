# Top TV Digital 0.7.30 — Tizen build fix

- Corrige falso erro no `prepare-tizen-build.mjs` ao detectar a string `type="module"` dentro do loader legacy do Vite.
- A validação agora verifica somente tags HTML `<script type="module">` reais.
- Mantém o build Tizen legacy/SystemJS, caminhos `./assets/`, `chrome69`, worker IIFE e `config.xml` automático.
- Não altera a lógica funcional do player em relação à 0.7.29.
