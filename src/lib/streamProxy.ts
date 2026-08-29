const SUPABASE_URL =
  String(import.meta.env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');

const SUPABASE_STREAM_PROXY =
  `${SUPABASE_URL}/functions/v1/stream-proxy`;

const VPS_STREAM_PROXY =
  String(import.meta.env.VITE_STREAM_PROXY_URL || '')
    .trim()
    .replace(/\/+$/, '');

const VPS_STREAM_PROXY_TOKEN =
  String(import.meta.env.VITE_STREAM_PROXY_TOKEN || '')
    .trim();

const USE_VPS_PROXY =
  Boolean(VPS_STREAM_PROXY && VPS_STREAM_PROXY_TOKEN);

const STREAM_PROXY = USE_VPS_PROXY
  ? VPS_STREAM_PROXY
  : SUPABASE_STREAM_PROXY;

function alreadyUsesStreamProxy(url: string): boolean {
  if (url.startsWith(`${STREAM_PROXY}?`)) return true;
  return /\/functions\/v1\/stream-proxy(?:\?|$)/i.test(url);
}

export function getPlayableStreamUrl(
  originalUrl: string,
): string {
  const url = originalUrl.trim();

  if (!url) {
    return '';
  }

  if (alreadyUsesStreamProxy(url)) {
    return url;
  }

  const requestUrl = new URL(STREAM_PROXY);
  requestUrl.searchParams.set('url', url);

  if (USE_VPS_PROXY) {
    requestUrl.searchParams.set('token', VPS_STREAM_PROXY_TOKEN);
  }

  return requestUrl.toString();
}
