// Samsung Tizen worker factory. A classic worker avoids module-worker support requirements.
export function createM3UWorker(): Worker {
  return new Worker(new URL('./m3u.worker.ts', import.meta.url));
}
