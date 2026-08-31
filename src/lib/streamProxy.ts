const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL;

const STREAM_PROXY =
  `${SUPABASE_URL}/functions/v1/stream-proxy`;

export function getPlayableStreamUrl(
  originalUrl: string,
): string {
  const url = originalUrl.trim();

  if (!url) {
    return '';
  }

  return (
    `${STREAM_PROXY}?url=` +
    encodeURIComponent(url)
  );
}

export async function resolvePlayableStreamUrl(
  originalUrl: string,
): Promise<string> {
  const proxyUrl = getPlayableStreamUrl(originalUrl);

  if (!proxyUrl) {
    return '';
  }

  const response = await fetch(`${proxyUrl}&resolve=1`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Falha ao preparar o stream (${response.status}).`);
  }

  const payload = await response.json() as { url?: unknown };
  if (typeof payload.url !== 'string' || !payload.url.startsWith('https://')) {
    throw new Error('O proxy retornou um endereço de stream inválido.');
  }

  return payload.url;
}
