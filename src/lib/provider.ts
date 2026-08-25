import {
  streamM3UResponse,
  type StreamProgress,
} from '@/lib/m3u';

import type { Channel } from '@/types';
import { readCatalogCache, writeCatalogCache } from '@/lib/catalogCache';

export interface ContentInfo {
  name?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  duration?: string;
  rating?: string;
  backdrop?: string;
  cover?: string;
  titleLogo?: string;
  trailerKey?: string;
  contentRating?: string;
  language?: string;
  castMembers?: SeriesCastMember[];
}

export interface CatalogItem extends Channel {
  rating?: string;
  added?: string;
  backdrop?: string;
  plot?: string;
  genre?: string;
  streamId?: string;
  contentType: 'movie' | 'series';
}

export interface AccountStatus {
  expiresAt: string | null;
  daysRemaining: number | null;
  renewalUrl?: string | null;
}

export interface SeriesCategory { id: string; name: string; }
export interface SeriesShow extends Channel { seriesId: string; categoryId: string; backdrop?: string; plot?: string; genre?: string; rating?: string; releaseDate?: string; added?: string; }
export interface SeriesEpisode extends Channel { season: number; episode: number; duration?: string; plot?: string; }
export interface SeriesCastMember { name: string; character?: string; image?: string; }
export interface SeriesDetails { info: Record<string, unknown>; episodes: SeriesEpisode[]; }
export interface MovieCategory { id: string; name: string; }
export interface MovieShow extends Channel { movieId: string; categoryId: string; rating?: string; added?: string; backdrop?: string; plot?: string; genre?: string; releaseDate?: string; }

const CATALOG_CACHE_MS = 20 * 60_000;
let seriesCatalogCache: { savedAt: number; value: { categories: SeriesCategory[]; shows: SeriesShow[] } } | null = null;
let movieCatalogCache: { savedAt: number; value: { categories: MovieCategory[]; movies: MovieShow[] } } | null = null;
let homeCatalogCache: { savedAt: number; value: { movies: CatalogItem[]; series: CatalogItem[] } } | null = null;
let homeCatalogRequest: Promise<{ movies: CatalogItem[]; series: CatalogItem[] } | null> | null = null;
let seriesCatalogRequest: Promise<{ categories: SeriesCategory[]; shows: SeriesShow[] } | null> | null = null;
let movieCatalogRequest: Promise<{ categories: MovieCategory[]; movies: MovieShow[] } | null> | null = null;
const seriesSeasonImageCache = new Map<string, Record<number, string>>();

function credentialScope(): string {
  try {
    const credentials = JSON.parse(localStorage.getItem('iptv:credentials') || 'null') as { provider?: string; username?: string } | null;
    return `${credentials?.provider || 'none'}:${credentials?.username || 'none'}`;
  } catch {
    return 'none';
  }
}

function cacheKey(dataset: string) {
  return `${credentialScope()}:${dataset}`;
}

async function authenticatedAction(action: string, extra: Record<string, unknown> = {}) {
  const credentials = JSON.parse(localStorage.getItem('iptv:credentials') || 'null') as { provider?: string; username?: string; password?: string } | null;
  if (!credentials?.provider || !credentials.username || !credentials.password) return null;
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ ...credentials, action, ...extra }),
  });
  return response.ok ? response : null;
}

export async function loadAccountStatus(): Promise<AccountStatus | null> {
  const response = await authenticatedAction('account-status');
  return response ? response.json() as Promise<AccountStatus> : null;
}

export async function readCachedHomeCatalog(): Promise<{ value: { movies: CatalogItem[]; series: CatalogItem[] }; savedAt: number } | null> {
  if (homeCatalogCache) return { value: homeCatalogCache.value, savedAt: homeCatalogCache.savedAt };
  const cached = await readCatalogCache<{ movies: CatalogItem[]; series: CatalogItem[] }>(cacheKey('home'));
  if (cached) homeCatalogCache = { savedAt: cached.savedAt, value: cached.value };
  return cached ? { value: cached.value, savedAt: cached.savedAt } : null;
}

export async function loadHomeCatalog(force = false): Promise<{ movies: CatalogItem[]; series: CatalogItem[] } | null> {
  const cached = await readCachedHomeCatalog();
  if (!force && cached && Date.now() - cached.savedAt < CATALOG_CACHE_MS) return cached.value;
  if (homeCatalogRequest) return homeCatalogRequest;
  homeCatalogRequest = (async () => {
    const response = await authenticatedAction('home-catalog');
    if (!response) return cached?.value ?? null;
    const result = await response.json() as { movies?: CatalogItem[]; series?: CatalogItem[] };
    const prepare = (items: CatalogItem[] | undefined) => (Array.isArray(items) ? items : []).map((item) => ({ ...item, logo: safeImageUrl(item.logo), backdrop: normalizeBackdrop(item.backdrop) }));
    const value = { movies: prepare(result.movies), series: prepare(result.series) };
    homeCatalogCache = { savedAt: Date.now(), value };
    await writeCatalogCache(cacheKey('home'), value);
    return value;
  })().finally(() => { homeCatalogRequest = null; });
  return homeCatalogRequest;
}

export async function loadSeriesCatalog(): Promise<{ categories: SeriesCategory[]; shows: SeriesShow[] } | null> {
  if (seriesCatalogCache && Date.now() - seriesCatalogCache.savedAt < CATALOG_CACHE_MS) return seriesCatalogCache.value;
  const persisted = await readCatalogCache<{ categories: SeriesCategory[]; shows: SeriesShow[] }>(cacheKey('series'));
  if (persisted && Date.now() - persisted.savedAt < CATALOG_CACHE_MS) {
    seriesCatalogCache = persisted;
    return persisted.value;
  }
  if (seriesCatalogRequest) return seriesCatalogRequest;
  seriesCatalogRequest = (async () => {
    const response = await authenticatedAction('series-catalog');
    if (!response) return persisted?.value ?? null;
    const result = await response.json() as { categories?: SeriesCategory[]; shows?: SeriesShow[] };
    const value = { categories: Array.isArray(result.categories) ? result.categories : [], shows: Array.isArray(result.shows) ? result.shows.map((show) => ({ ...show, logo: safeImageUrl(show.logo), backdrop: normalizeBackdrop(show.backdrop) })) : [] };
    seriesCatalogCache = { savedAt: Date.now(), value };
    await writeCatalogCache(cacheKey('series'), value);
    return value;
  })().finally(() => { seriesCatalogRequest = null; });
  return seriesCatalogRequest;
}

export async function loadMovieCatalog(): Promise<{ categories: MovieCategory[]; movies: MovieShow[] } | null> {
  if (movieCatalogCache && Date.now() - movieCatalogCache.savedAt < CATALOG_CACHE_MS) return movieCatalogCache.value;
  const persisted = await readCatalogCache<{ categories: MovieCategory[]; movies: MovieShow[] }>(cacheKey('movies'));
  if (persisted && Date.now() - persisted.savedAt < CATALOG_CACHE_MS) {
    movieCatalogCache = persisted;
    return persisted.value;
  }
  if (movieCatalogRequest) return movieCatalogRequest;
  movieCatalogRequest = (async () => {
    const response = await authenticatedAction('movie-catalog');
    if (!response) return persisted?.value ?? null;
    const result = await response.json() as { categories?: MovieCategory[]; movies?: MovieShow[] };
    const value = {
      categories: Array.isArray(result.categories) ? result.categories : [],
      movies: Array.isArray(result.movies) ? result.movies.map((movie) => ({ ...movie, logo: safeImageUrl(movie.logo), backdrop: normalizeBackdrop(movie.backdrop) })) : [],
    };
    movieCatalogCache = { savedAt: Date.now(), value };
    await writeCatalogCache(cacheKey('movies'), value);
    return value;
  })().finally(() => { movieCatalogRequest = null; });
  return movieCatalogRequest;
}

export async function loadSeriesDetails(seriesId: string, contentName?: string, contentYear?: string): Promise<SeriesDetails | null> {
  const response = await authenticatedAction('series-info', { streamId: seriesId, contentName, contentYear });
  if (!response) return null;
  const result = await response.json() as SeriesDetails;
  return { info: result.info || {}, episodes: Array.isArray(result.episodes) ? result.episodes.map((episode) => ({ ...episode, logo: safeImageUrl(episode.logo) })) : [] };
}

export async function loadSeriesSeasonImages(tmdbId: string, season: number): Promise<Record<number, string>> {
  const key = `${tmdbId}:${season}`;
  const cached = seriesSeasonImageCache.get(key);
  if (cached) return cached;
  const response = await authenticatedAction('series-season-images', { tmdbId, season });
  if (!response) return {};
  const result = await response.json() as { images?: Record<string, string> };
  const images = Object.fromEntries(Object.entries(result.images || {})
    .filter(([episode, image]) => Number(episode) > 0 && typeof image === 'string' && image)
    .map(([episode, image]) => [Number(episode), image]));
  seriesSeasonImageCache.set(key, images);
  return images;
}

function safeImageUrl(value?: string): string | undefined {
  const url = value?.trim();
  if (!url) return undefined;
  if (!/^http:\/\//i.test(url)) return url;
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-proxy?url=${encodeURIComponent(url)}`;
}

function streamIdFromUrl(url: string): string | null {
  const match = url.match(/\/(\d+)(?:\.[a-z0-9]+)?(?:\?.*)?$/i);
  return match?.[1] ?? null;
}

function normalizeBackdrop(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = normalizeBackdrop(entry);
      if (result) return result;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const result = normalizeBackdrop(entry);
      if (result) return result;
    }
    return undefined;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try { return normalizeBackdrop(JSON.parse(trimmed)); } catch { return undefined; }
  }
  if (trimmed.startsWith('/')) return `https://image.tmdb.org/t/p/original${trimmed}`;
  if (!/^https?:\/\//i.test(trimmed)) return undefined;
  const normalized = trimmed
    .replace(/^http:\/\/image\.tmdb\.org/i, 'https://image.tmdb.org')
    .replace(/\/t\/p\/(?:w\d+|original)\//, '/t/p/original/');
  return safeImageUrl(normalized);
}

function findBackdrop(value: unknown, depth = 0): string | undefined {
  if (typeof value === 'string' && (value.trim().startsWith('{') || value.trim().startsWith('['))) {
    try { return findBackdrop(JSON.parse(value), depth + 1); } catch { return undefined; }
  }
  if (!value || typeof value !== 'object' || depth > 5) return undefined;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/backdrop|background|fanart/i.test(key)) {
      const result = normalizeBackdrop(entry);
      if (result) return result;
    }
  }
  for (const entry of Object.values(value as Record<string, unknown>)) {
    const result = findBackdrop(entry, depth + 1);
    if (result) return result;
  }
  return undefined;
}

export async function loadContentInfo(channel: Channel): Promise<ContentInfo | null> {
  const streamId = streamIdFromUrl(channel.url);
  if (!streamId) return null;
  const response = await authenticatedAction('content-info', { streamId });
  if (!response) return null;
  const raw = await response.json() as Record<string, unknown>;
  const info = (raw.info && typeof raw.info === 'object' ? raw.info : raw) as Record<string, unknown>;
  const movieData = (raw.movie_data && typeof raw.movie_data === 'object' ? raw.movie_data : {}) as Record<string, unknown>;
  const tmdb = (raw._tmdb && typeof raw._tmdb === 'object' ? raw._tmdb : {}) as Record<string, unknown>;
  const backdrop = normalizeBackdrop(
    tmdb.backdrop ?? info.backdrop_path ?? info.backdrop ?? movieData.backdrop_path ?? movieData.backdrop ?? raw.backdrop_path ?? raw.backdrop,
  ) ?? findBackdrop(raw);
  const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
  const castSource = Array.isArray(tmdb.castMembers) ? tmdb.castMembers : Array.isArray(info.castMembers) ? info.castMembers : [];
  const castMembers = castSource.map((item) => item && typeof item === 'object' ? {
    name: text((item as Record<string, unknown>).name) || '',
    character: text((item as Record<string, unknown>).character),
    image: safeImageUrl(text((item as Record<string, unknown>).image)),
  } : { name: text(item) || '' }).filter((item) => item.name);

  return {
    name: text(tmdb.name ?? info.name ?? movieData.name), plot: text(tmdb.plot ?? info.plot ?? info.description), cast: text(tmdb.cast ?? info.cast),
    director: text(tmdb.director ?? info.director), genre: text(tmdb.genre ?? info.genre), releaseDate: text(tmdb.releaseDate ?? info.release_date ?? info.releasedate),
    duration: text(tmdb.duration ?? info.duration), rating: text(tmdb.rating ?? info.rating ?? info.rating_5based), backdrop,
    cover: text(tmdb.poster ?? info.movie_image ?? info.cover_big ?? movieData.stream_icon),
    titleLogo: text(tmdb.logo), trailerKey: text(tmdb.trailerKey ?? info.youtube_trailer),
    contentRating: text(tmdb.contentRating ?? info.rating_age ?? info.mpaa_rating),
    language: text(tmdb.language ?? info.language), castMembers,
  };
}

const CONNECT_TIMEOUT = 20000;

/*
|--------------------------------------------------------------------------
| ERRO DA API
|--------------------------------------------------------------------------
*/

async function getResponseError(
  response: Response,
): Promise<string> {
  const responseText =
    await response
      .text()
      .catch(() => '');

  if (!responseText) {
    return `O servidor respondeu com erro (${response.status}).`;
  }

  try {
    const body: unknown =
      JSON.parse(responseText);

    if (
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      return body.error;
    }
  } catch {
    // resposta não era JSON
  }

  return responseText.trim() ||
    `O servidor respondeu com erro (${response.status}).`;
}

/*
|--------------------------------------------------------------------------
| SIGNAL + TIMEOUT
|--------------------------------------------------------------------------
|
| Junta:
|
| - Cancelar do usuário
| - timeout interno
|
*/

function createRequestController(
  externalSignal?: AbortSignal,
) {
  const controller =
    new AbortController();

  let timedOut = false;

  const timeout =
    window.setTimeout(
      () => {
        timedOut = true;

        controller.abort();
      },
      CONNECT_TIMEOUT,
    );

  const onExternalAbort =
    () => {
      controller.abort();
    };

  if (externalSignal) {
    if (
      externalSignal.aborted
    ) {
      controller.abort();
    } else {
      externalSignal.addEventListener(
        'abort',
        onExternalAbort,
        {
          once: true,
        },
      );
    }
  }

  const cleanup =
    () => {
      window.clearTimeout(
        timeout,
      );

      externalSignal
        ?.removeEventListener(
          'abort',
          onExternalAbort,
        );
    };

  return {
    controller,
    cleanup,
    didTimeout: () =>
      timedOut,
  };
}

/*
|--------------------------------------------------------------------------
| CONNECT-LINE
|--------------------------------------------------------------------------
*/

async function connectLine(
  provider: string,
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<{
  response: Response;
  requestSignal: AbortSignal;
  cleanup: () => void;
}> {
  const {
    controller,
    cleanup,
    didTimeout,
  } =
    createRequestController(
      signal,
    );

  try {
    const response =
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-line`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },

          body: JSON.stringify({
            provider,
            username,
            password,
          }),

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      const message =
        await getResponseError(
          response,
        );

      cleanup();

      throw new Error(
        message,
      );
    }

    return {
      response,
      requestSignal:
        controller.signal,
      cleanup,
    };
  } catch (error) {
    cleanup();

    /*
     * Cancelado manualmente
     */
    if (
      signal?.aborted
    ) {
      throw new DOMException(
        'Carregamento cancelado.',
        'AbortError',
      );
    }

    /*
     * Timeout
     */
    if (didTimeout()) {
      throw new Error(
        'O servidor demorou demais para responder. Tente novamente.',
      );
    }

    /*
     * Abort interno
     */
    if (
      error instanceof DOMException &&
      error.name ===
        'AbortError'
    ) {
      throw new DOMException(
        'Carregamento cancelado.',
        'AbortError',
      );
    }

    throw error;
  }
}

function normalizeProviderStreamUrl(
  channel: Channel,
  streamBase: string,
  username: string,
  password: string,
): Channel {
  if (!streamBase || !channel.url) return channel;
  try {
    const original = new URL(channel.url);
    const filename = original.pathname.split('/').filter(Boolean).pop();
    if (!filename) return channel;
    const kind = channel.category === 'movies' ? 'movie' : channel.category === 'series' ? 'series' : 'live';
    const base = streamBase.replace(/\/$/, '');
    const url = `${base}/${kind}/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${filename}`;
    return { ...channel, id: `${url}::${channel.name}`, url };
  } catch {
    return channel;
  }
}

function normalizeProviderProgress(
  progress: StreamProgress,
  streamBase: string,
  username: string,
  password: string,
): StreamProgress {
  if (!progress.channels.length || !streamBase) return progress;
  return { ...progress, channels: progress.channels.map((channel) => normalizeProviderStreamUrl(channel, streamBase, username, password)) };
}

/*
|--------------------------------------------------------------------------
| CARREGAMENTO COMPLETO
|--------------------------------------------------------------------------
*/

export async function loadLinePlaylist(
  provider: string,
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<{
  channels: Channel[];
}> {
  const {
    response,
    requestSignal,
    cleanup,
  } =
    await connectLine(
      provider,
      username,
      password,
      signal,
    );

  const result: Channel[] =
    [];

  const streamBase = response.headers.get('X-Provider-Stream-Base')?.trim() || '';

  try {
    await streamM3UResponse(
      response,

      (
        progress:
          StreamProgress,
      ) => {
        if (
          progress.channels
            .length
        ) {
          result.push(
            ...normalizeProviderProgress(progress, streamBase, username, password).channels,
          );
        }
      },

      requestSignal,
    );
  } finally {
    cleanup();
  }

  if (
    result.length === 0
  ) {
    throw new Error(
      'Lista sem canais.',
    );
  }

  return {
    channels: result,
  };
}

/*
|--------------------------------------------------------------------------
| CARREGAMENTO STREAMING
|--------------------------------------------------------------------------
*/

export async function loadLinePlaylistStreaming(
  provider: string,
  username: string,
  password: string,
  onBatch: (
    progress:
      StreamProgress,
  ) =>
    void |
    Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const {
    response,
    requestSignal,
    cleanup,
  } =
    await connectLine(
      provider,
      username,
      password,
      signal,
    );

  const streamBase = response.headers.get('X-Provider-Stream-Base')?.trim() || '';

  try {
    await streamM3UResponse(
      response,
      (progress) => onBatch(normalizeProviderProgress(progress, streamBase, username, password)),
      requestSignal,
    );
  } catch (error) {
    if (
      signal?.aborted
    ) {
      throw new DOMException(
        'Carregamento cancelado.',
        'AbortError',
      );
    }

    throw error;
  } finally {
    cleanup();
  }
}
