export interface M3UParams {
  host: string;
  username: string;
  password: string;
  streamType?: 'm3u' | 'hls';
}

function withEPrefix(host: string): string {
  const trimmed = host.trim().replace(/\/$/, '');
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname.startsWith('e.')) {
      parsed.hostname = `e.${parsed.hostname}`;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed.replace(/^(\w+:\/\/)(?!e\.)/, '$1e.');
    }
    return `e.${trimmed}`;
  }
}

export function buildM3ULink({ host, username, password, streamType = 'm3u' }: M3UParams): string {
  const base = withEPrefix(host);
  return `${base}/p/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamType}`;
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('Clipboard unavailable'));
}
