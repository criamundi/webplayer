export interface M3UParams {
  host: string;
  username: string;
  password: string;
}

export function buildM3ULink({ host, username, password }: M3UParams): string {
  const base = host.trim().replace(/\/$/, '');
  const path = base.toLowerCase().endsWith('/get.php') ? '' : '/get.php';
  const params = new URLSearchParams({ username, password, type: 'm3u_plus', output: 'ts' });
  return `${base}${path}?${params.toString()}`;
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('Clipboard unavailable'));
}
