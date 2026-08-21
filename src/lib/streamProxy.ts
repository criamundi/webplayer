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