export interface TodayMatch {
  id: string;
  competition?: string;
  home: string;
  away: string;
  time: string;
  channels: string[];
}

export async function loadTodayMatches(): Promise<TodayMatch[]> {
  const endpoint = (import.meta.env.VITE_SPORTS_FEED_URL as string | undefined)?.trim();
  if (!endpoint) return [];
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Agenda esportiva indisponível (${response.status})`);
  const payload = await response.json() as { matches?: TodayMatch[] } | TodayMatch[];
  const matches = Array.isArray(payload) ? payload : payload.matches;
  if (!Array.isArray(matches)) return [];
  return matches.slice(0, 8).filter((match) => match?.id && match.home && match.away && match.time);
}
