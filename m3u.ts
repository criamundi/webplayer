import type { Channel, ParsedPlaylist } from '@/types';

export type PlaylistCategory = 'live' | 'movies' | 'series' | 'radio' | 'other';

export interface StreamProgress {
  channels: Channel[];
  groups: string[];
  done: boolean;
  channelCount: number;
  groupCount: number;
  category?: PlaylistCategory;
  total?: number;
  overallTotal?: number;
  totals?: Record<PlaylistCategory, number>;
  groupsByCategory?: Record<PlaylistCategory, string[]>;
}

type WorkerMessage =
  | { type: 'ready' }
  | { type: 'chunkDone' }
  | {
      type: 'batch';
      category: PlaylistCategory;
      channels: Channel[];
      total: number;
      overallTotal: number;
    }
  | {
      type: 'done';
      totals: Record<PlaylistCategory, number>;
      overallTotal: number;
      groups: string[];
      groupsByCategory: Record<PlaylistCategory, string[]>;
    }
  | { type: 'error'; error: string };

type BatchHandler = (progress: StreamProgress) => void | Promise<void>;

function abortError() {
  return new DOMException('Carregamento cancelado.', 'AbortError');
}

export async function streamM3UResponse(
  response: Response,
  onBatch: BatchHandler,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) {
    throw new Error('O provedor não enviou uma lista válida.');
  }

  if (signal?.aborted) throw abortError();

  const worker = new Worker(new URL('./m3u.worker.ts', import.meta.url), { type: 'module' });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let readyResolve: (() => void) | null = null;
  let chunkResolve: (() => void) | null = null;
  let doneResolve: (() => void) | null = null;
  let fatalReject: ((reason?: unknown) => void) | null = null;
  let finished = false;

  const fatalPromise = new Promise<void>((resolve, reject) => {
    doneResolve = resolve;
    fatalReject = reject;
  });

  const cleanup = () => {
    signal?.removeEventListener('abort', handleAbort);
    try { reader.releaseLock(); } catch { /* noop */ }
    worker.terminate();
  };

  const fail = (error: unknown) => {
    if (finished) return;
    finished = true;
    fatalReject?.(error);
  };

  const handleAbort = () => {
    void reader.cancel().catch(() => {});
    fail(abortError());
  };

  signal?.addEventListener('abort', handleAbort, { once: true });

  worker.onerror = (event) => {
    fail(new Error(event.message || 'Erro no processamento da lista.'));
  };

  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const data = event.data;

    if (data.type === 'ready') {
      readyResolve?.();
      readyResolve = null;
      return;
    }

    if (data.type === 'chunkDone') {
      chunkResolve?.();
      chunkResolve = null;
      return;
    }

    if (data.type === 'error') {
      fail(new Error(data.error || 'Erro no processamento da lista.'));
      return;
    }

    if (data.type === 'batch') {
      // O worker só envia o próximo lote depois do ACK. Assim não se acumulam
      // centenas de transações IndexedDB nem centenas de renders.
      Promise.resolve(
        onBatch({
          channels: data.channels,
          groups: [],
          done: false,
          channelCount: data.overallTotal,
          groupCount: 0,
          category: data.category,
          total: data.total,
          overallTotal: data.overallTotal,
        }),
      )
        .then(() => worker.postMessage({ type: 'ack' }))
        .catch(fail);
      return;
    }

    if (data.type === 'done') {
      Promise.resolve(
        onBatch({
          channels: [],
          groups: data.groups,
          done: true,
          channelCount: data.overallTotal,
          groupCount: data.groups.length,
          overallTotal: data.overallTotal,
          totals: data.totals,
          groupsByCategory: data.groupsByCategory,
        }),
      )
        .then(() => {
          if (finished) return;
          finished = true;
          doneResolve?.();
        })
        .catch(fail);
    }
  };

  try {
    const ready = new Promise<void>((resolve) => { readyResolve = resolve; });
    worker.postMessage({ type: 'start' });
    await Promise.race([ready, fatalPromise]);

    while (!finished) {
      if (signal?.aborted) throw abortError();

      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;

      const text = decoder.decode(value, { stream: true });
      if (!text) continue;

      const chunkDone = new Promise<void>((resolve) => { chunkResolve = resolve; });
      worker.postMessage({ type: 'chunk', text });
      await Promise.race([chunkDone, fatalPromise]);
    }

    if (!finished) {
      const tail = decoder.decode();
      if (tail) {
        const chunkDone = new Promise<void>((resolve) => { chunkResolve = resolve; });
        worker.postMessage({ type: 'chunk', text: tail });
        await Promise.race([chunkDone, fatalPromise]);
      }

      worker.postMessage({ type: 'end' });
      await fatalPromise;
    }
  } finally {
    cleanup();
  }
}

export async function parseM3UResponse(
  response: Response,
  signal?: AbortSignal,
): Promise<ParsedPlaylist> {
  const channels: Channel[] = [];
  let groups: string[] = [];

  await streamM3UResponse(
    response,
    (progress) => {
      if (progress.channels.length) channels.push(...progress.channels);
      if (progress.done) groups = progress.groups;
    },
    signal,
  );

  return { channels, groups };
}

export async function fetchPlaylist(url: string, signal?: AbortSignal): Promise<ParsedPlaylist> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const endpoint = `${supabaseUrl}/functions/v1/fetch-playlist`;

  let response: Response;
  try {
    response = await fetch(`${endpoint}?url=${encodeURIComponent(url)}`, {
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Não foi possível conectar ao serviço. Tente novamente.');
  }

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || 'Não foi possível carregar essa lista. Verifique a URL e tente novamente.');
  }

  return parseM3UResponse(response, signal);
}

// Parser síncrono mantido apenas para listas pequenas/importações legadas.
export function parseM3U(content: string): ParsedPlaylist {
  const channels: Channel[] = [];
  const groupSet = new Set<string>();
  let current: Partial<Channel> | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#EXTM3U')) continue;

    if (line.startsWith('#EXTINF')) {
      const info = line.slice(line.indexOf(':') + 1);
      const comma = info.lastIndexOf(',');
      const name = comma >= 0 ? info.slice(comma + 1).trim() : 'Sem nome';
      const attr = (key: string) => info.match(new RegExp(`${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
      const groupMatch = attr('group-title');
      const logoMatch = attr('tvg-logo');
      const tvgIdMatch = attr('tvg-id');
      const group = groupMatch?.[1]?.trim() || groupMatch?.[2]?.trim() || 'Outros';
      groupSet.add(group);
      current = {
        name: name || 'Sem nome',
        group,
        logo: logoMatch?.[1]?.trim() || logoMatch?.[2]?.trim() || undefined,
        tvgId: tvgIdMatch?.[1]?.trim() || tvgIdMatch?.[2]?.trim() || undefined,
      };
      continue;
    }

    if (!line.startsWith('#') && current) {
      channels.push({
        id: `${line}::${current.name || 'Sem nome'}`,
        name: current.name || 'Sem nome',
        url: line,
        logo: current.logo,
        group: current.group || 'Outros',
        tvgId: current.tvgId,
      });
      current = null;
    }
  }

  return {
    channels,
    groups: Array.from(groupSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
  };
}
