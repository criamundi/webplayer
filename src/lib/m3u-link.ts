export interface M3UParams {
  host: string;
  username: string;
  password: string;
  streamType?: 'm3u' | 'hls';
}

function normalizeHost(host: string): string {
  const trimmed = host.trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export function buildM3ULink({ host, username, password, streamType = 'm3u' }: M3UParams): string {
  const base = normalizeHost(host);
  const url = new URL(base);
  const basePath = url.pathname.toLowerCase().endsWith('.php')
    ? url.pathname.slice(0, url.pathname.lastIndexOf('/'))
    : url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/get.php`;
  url.search = new URLSearchParams({
    username,
    password,
    type: 'm3u_plus',
    output: streamType === 'hls' ? 'm3u8' : 'ts',
  }).toString();
  return url.toString();
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('Clipboard unavailable'));
}
