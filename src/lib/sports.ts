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
  if (endpoint) {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Agenda esportiva indisponível (${response.status})`);
    const payload = await response.json() as { matches?: TodayMatch[] } | TodayMatch[];
    const matches = Array.isArray(payload) ? payload : payload.matches;
    return Array.isArray(matches) ? matches.slice(0, 8).filter((match) => match?.id && match.home && match.away && match.time) : [];
  }

  type EspnTeam = { homeAway?: string; team?: { displayName?: string } };
  type EspnEvent = { id?: string; date?: string; competitions?: Array<{ competitors?: EspnTeam[]; broadcasts?: Array<{ names?: string[]; shortName?: string }> }> };
  type EspnPayload = { events?: EspnEvent[]; leagues?: Array<{ name?: string }> };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '');
  const leagues = ['bra.1', 'bra.2', 'bra.copa_do_brazil'];
  const results = await Promise.allSettled(leagues.map(async (league) => {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${today}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) return [];
    const payload = await response.json() as EspnPayload;
    const competition = payload.leagues?.[0]?.name || 'Futebol brasileiro';
    return (payload.events || []).flatMap<TodayMatch>((event) => {
      const details = event.competitions?.[0];
      const home = details?.competitors?.find((team) => team.homeAway === 'home')?.team?.displayName;
      const away = details?.competitors?.find((team) => team.homeAway === 'away')?.team?.displayName;
      if (!event.id || !event.date || !home || !away) return [];
      const channels = (details?.broadcasts || []).flatMap((broadcast) => broadcast.names || (broadcast.shortName ? [broadcast.shortName] : []));
      return [{ id: `${league}-${event.id}`, competition, home, away, time: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(event.date)), channels: [...new Set(channels)] }];
    });
  }));
  return results.flatMap((result) => result.status === 'fulfilled' ? result.value : []).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 8);
}
