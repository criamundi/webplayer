// Web/Bolt worker factory. Keep the Worker options static so Vite can parse it.
export function createM3UWorker(): Worker {
  return new Worker(new URL('./m3u.worker.ts', import.meta.url), { type: 'module' });
}
