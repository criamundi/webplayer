import {
  streamM3UResponse,
  type StreamProgress,
} from '@/lib/m3u';

import type { Channel } from '@/types';

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
}

function streamIdFromUrl(url: string): string | null {
  const match = url.match(/\/(\d+)(?:\.[a-z0-9]+)?(?:\?.*)?$/i);
  return match?.[1] ?? null;
}

export async function loadContentInfo(channel: Channel): Promise<ContentInfo | null> {
  const credentials = JSON.parse(localStorage.getItem('iptv:credentials') || 'null') as { provider?: string; username?: string; password?: string } | null;
  const streamId = streamIdFromUrl(channel.url);
  if (!credentials?.provider || !credentials.username || !credentials.password || !streamId) return null;

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ ...credentials, action: 'content-info', streamId }),
  });
  if (!response.ok) return null;
  const raw = await response.json() as Record<string, unknown>;
  const info = (raw.info && typeof raw.info === 'object' ? raw.info : raw) as Record<string, unknown>;
  const movieData = (raw.movie_data && typeof raw.movie_data === 'object' ? raw.movie_data : {}) as Record<string, unknown>;
  const backdropValue = info.backdrop_path ?? info.backdrop;
  const backdrop = Array.isArray(backdropValue) ? backdropValue.find((value) => typeof value === 'string') : backdropValue;
  const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;

  return {
    name: text(info.name ?? movieData.name), plot: text(info.plot ?? info.description), cast: text(info.cast),
    director: text(info.director), genre: text(info.genre), releaseDate: text(info.release_date ?? info.releasedate),
    duration: text(info.duration), rating: text(info.rating ?? info.rating_5based), backdrop: text(backdrop),
    cover: text(info.movie_image ?? info.cover_big ?? movieData.stream_icon),
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
            ...progress.channels,
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

  try {
    await streamM3UResponse(
      response,
      onBatch,
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
