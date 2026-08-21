import type { Channel } from '@/types';

type Category = 'live' | 'movies' | 'series' | 'radio' | 'other';

type WorkerRequest =
  | { type: 'start' }
  | { type: 'chunk'; text: string }
  | { type: 'ack' }
  | { type: 'end' };

type WorkerChannel = Channel & { category: Category };

const BATCH_SIZE = 500;

const batches: Record<Category, WorkerChannel[]> = {
  live: [],
  movies: [],
  series: [],
  radio: [],
  other: [],
};

const groups: Record<Category, Set<string>> = {
  live: new Set(),
  movies: new Set(),
  series: new Set(),
  radio: new Set(),
  other: new Set(),
};

const totals: Record<Category, number> = {
  live: 0,
  movies: 0,
  series: 0,
  radio: 0,
  other: 0,
};

let overallTotal = 0;
let pending = '';
let current: Partial<Channel> | null = null;
let ackResolver: (() => void) | null = null;
let processing = Promise.resolve();

function resetState() {
  for (const category of Object.keys(batches) as Category[]) {
    batches[category].length = 0;
    groups[category].clear();
    totals[category] = 0;
  }
  overallTotal = 0;
  pending = '';
  current = null;
}

function getAttribute(input: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = input.match(new RegExp(`${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match?.[1]?.trim() || match?.[2]?.trim() || undefined;
}

function parseExtInf(line: string): Partial<Channel> {
  const colon = line.indexOf(':');
  const info = colon >= 0 ? line.slice(colon + 1) : line;
  const comma = info.lastIndexOf(',');
  const name = comma >= 0 ? info.slice(comma + 1).trim() : 'Sem nome';

  return {
    name: name || 'Sem nome',
    tvgId: getAttribute(info, 'tvg-id'),
    logo: getAttribute(info, 'tvg-logo'),
    group: getAttribute(info, 'group-title') || 'Outros',
  };
}

function classifyGroup(group: string): Category {
  const value = group.toLocaleLowerCase('pt-BR');

  if (/(r[aá]dios?|radio|(^|\s)fm($|\s))/.test(value)) return 'radio';
  if (/(s[eé]ries?|series|temporadas?|season|tv\s*shows?)/.test(value)) return 'series';
  if (/(filmes?|movies?|cinema|(^|\s)vod($|\s)|lan[cç]amentos?)/.test(value)) return 'movies';

  // M3U normalmente não possui um campo separado de tipo. Se o group-title
  // não declarar VOD/série/rádio, tratamos como TV ao vivo.
  return 'live';
}

function waitForAck(): Promise<void> {
  return new Promise((resolve) => {
    ackResolver = resolve;
  });
}

async function flush(category: Category) {
  if (batches[category].length === 0) return;

  const payload = batches[category].splice(0, batches[category].length);
  self.postMessage({
    type: 'batch',
    category,
    channels: payload,
    total: totals[category],
    overallTotal,
  });

  // Backpressure: só continua depois que a aplicação terminou de persistir
  // este lote no IndexedDB.
  await waitForAck();
}

async function processLine(rawLine: string) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#EXTM3U')) return;

  if (line.startsWith('#EXTINF')) {
    current = parseExtInf(line);
    return;
  }

  if (line.startsWith('#') || !current) return;

  const name = current.name || 'Sem nome';
  const group = current.group || 'Outros';
  const category = classifyGroup(group);

  batches[category].push({
    id: `${line}::${name}`,
    name,
    url: line,
    logo: current.logo,
    group,
    tvgId: current.tvgId,
    category,
  });

  groups[category].add(group);
  totals[category] += 1;
  overallTotal += 1;
  current = null;

  if (batches[category].length >= BATCH_SIZE) {
    await flush(category);
  }
}

async function processText(text: string, final: boolean) {
  pending += text;
  const lines = pending.split(/\r?\n/);

  if (!final) {
    pending = lines.pop() || '';
  } else {
    pending = '';
  }

  for (const line of lines) {
    await processLine(line);
  }

  if (final) {
    for (const category of Object.keys(batches) as Category[]) {
      await flush(category);
    }
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === 'ack') {
    const resolve = ackResolver;
    ackResolver = null;
    resolve?.();
    return;
  }

  if (message.type === 'start') {
    resetState();
    self.postMessage({ type: 'ready' });
    return;
  }

  if (message.type === 'chunk') {
    processing = processing
      .then(async () => {
        await processText(message.text, false);
        self.postMessage({ type: 'chunkDone' });
      })
      .catch((error) => {
        self.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Erro ao processar a lista.',
        });
      });
    return;
  }

  if (message.type === 'end') {
    processing = processing
      .then(async () => {
        await processText(pending ? '\n' : '', true);

        const groupsByCategory = Object.fromEntries(
          (Object.keys(groups) as Category[]).map((category) => [
            category,
            Array.from(groups[category]).sort((a, b) => a.localeCompare(b, 'pt-BR')),
          ]),
        );

        const allGroups = Array.from(
          new Set((Object.values(groupsByCategory) as string[][]).flat()),
        ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

        self.postMessage({
          type: 'done',
          totals: { ...totals },
          overallTotal,
          groups: allGroups,
          groupsByCategory,
        });
      })
      .catch((error) => {
        self.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Erro ao finalizar a lista.',
        });
      });
  }
};
