export interface M3UParams {
  host: string;
  username: string;
  password: string;
  streamType?: 'm3u' | 'hls';
}

export function buildM3ULink({ host, username, password, streamType = 'm3u' }: M3UParams): string {
  const base = host.trim().replace(/\/$/, '');
  return `${base}/p/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamType}`;
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('Clipboard unavailable'));
}
