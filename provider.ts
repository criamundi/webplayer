import {
  streamM3UResponse,
  type StreamProgress,
} from '@/lib/m3u';

import type { Channel } from '@/types';

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