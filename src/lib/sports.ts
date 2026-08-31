import { getChannels } from '@/lib/playlistStore';
import type { Channel } from '@/types';

export interface MatchProbabilities {
  home: number;
  draw: number;
  away: number;
  source?: 'market' | 'baseline';
}

export interface TodayMatch {
  id: string;
  competition?: string;
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  venue?: string;
  kickoff?: string;
  time: string;
  status?: string;
  channels: string[];
  probabilities?: MatchProbabilities;
}

export interface ResolvedBroadcast {
  name: string;
  channel: Channel;
}

const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';
const SPORTS_DB_BASE = 'https://www.thesportsdb.com/api/v1/json/123';
const SPORTS_CACHE_KEY = 'nexus:sports-feed:v1';
const SPORTS_CACHE_MS = 10 * 60 * 1000;
const competitions = [
  { slug: 'bra.1', priority: 1, fallbackName: 'Brasileirão' },
  { slug: 'bra.copa_do_brazil', priority: 2, fallbackName: 'Copa do Brasil' },
  { slug: 'conmebol.libertadores', priority: 3, fallbackName: 'Libertadores' },
  { slug: 'uefa.champions', priority: 4, fallbackName: 'Champions League' },
  { slug: 'fifa.worldq.conmebol', priority: 5, fallbackName: 'Eliminatórias' },
  { slug: 'fifa.friendly', priority: 6, fallbackName: 'Seleções' },
  { slug: 'bra.2', priority: 7, fallbackName: 'Brasileirão Série B' },
] as const;

type EspnTeam = { homeAway?: 'home' | 'away'; team?: { displayName?: string; shortDisplayName?: string; logo?: string } };
type EspnOdds = { homeTeamOdds?: { moneyLine?: number }; awayTeamOdds?: { moneyLine?: number }; drawOdds?: { moneyLine?: number } };
type EspnCompetition = { competitors?: EspnTeam[]; broadcasts?: Array<{ names?: string[]; shortName?: string }>; venue?: { fullName?: string; address?: { city?: string } }; odds?: EspnOdds[] };
type EspnEvent = { id?: string; date?: string; competitions?: EspnCompetition[]; status?: { type?: { detail?: string; shortDetail?: string } } };
type EspnPayload = { events?: EspnEvent[]; leagues?: Array<{ name?: string }> };
type PrioritizedMatch = TodayMatch & { competitionPriority: number };

function sportsFeedEndpoint() {
  return (import.meta.env.VITE_SPORTS_FEED_URL as string | undefined)?.trim() || '';
}

function todayInBrazil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BRAZIL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function timeInBrazil(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BRAZIL_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(isoDate));
}

function uniqueNames(values: Array<string | undefined>) {
  const found = new Map<string, string>();
  for (const value of values) {
    const name = value?.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase('pt-BR');
    if (!found.has(key)) found.set(key, name);
  }
  return [...found.values()];
}

function americanOddsProbability(value?: number) {
  if (!value || !Number.isFinite(value)) return null;
  return value > 0 ? 100 / (value + 100) : Math.abs(value) / (Math.abs(value) + 100);
}

function probabilitiesFor(eventId: string, odds?: EspnOdds): MatchProbabilities {
  const home = americanOddsProbability(odds?.homeTeamOdds?.moneyLine);
  const draw = americanOddsProbability(odds?.drawOdds?.moneyLine);
  const away = americanOddsProbability(odds?.awayTeamOdds?.moneyLine);
  if (home && draw && away) {
    const total = home + draw + away;
    const normalizedHome = Math.round((home / total) * 100);
    const normalizedDraw = Math.round((draw / total) * 100);
    return { home: normalizedHome, draw: normalizedDraw, away: 100 - normalizedHome - normalizedDraw, source: 'market' };
  }
  let hash = 0;
  for (const character of eventId) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  const adjustment = Math.abs(hash) % 11 - 5;
  const baselineHome = 41 + adjustment;
  const baselineDraw = 29 - Math.round(adjustment / 3);
  return { home: baselineHome, draw: baselineDraw, away: 100 - baselineHome - baselineDraw, source: 'baseline' };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadCompetition(date: string, config: typeof competitions[number]) {
  const compactDate = date.replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${config.slug}/scoreboard?dates=${compactDate}&region=br&lang=pt`;
  const payload = await fetchJson<EspnPayload>(url);
  const competitionName = payload?.leagues?.[0]?.name || config.fallbackName;
  return (payload?.events || []).flatMap<PrioritizedMatch>((event) => {
    const details = event.competitions?.[0];
    const homeTeam = details?.competitors?.find((team) => team.homeAway === 'home')?.team;
    const awayTeam = details?.competitors?.find((team) => team.homeAway === 'away')?.team;
    const home = homeTeam?.displayName || homeTeam?.shortDisplayName;
    const away = awayTeam?.displayName || awayTeam?.shortDisplayName;
    if (!event.id || !event.date || !home || !away) return [];
    const channels = uniqueNames((details?.broadcasts || []).flatMap((broadcast) => broadcast.names?.length ? broadcast.names : [broadcast.shortName]));
    const venue = [details?.venue?.fullName, details?.venue?.address?.city].filter(Boolean).join(' • ');
    return [{
      id: `${config.slug}-${event.id}`,
      competition: competitionName,
      competitionPriority: config.priority,
      home,
      away,
      homeLogo: homeTeam?.logo,
      awayLogo: awayTeam?.logo,
      venue: venue || undefined,
      kickoff: event.date,
      time: timeInBrazil(event.date),
      status: event.status?.type?.shortDetail || event.status?.type?.detail,
      channels,
      probabilities: probabilitiesFor(event.id, details?.odds?.[0]),
    }];
  });
}

function sportsDbSearchName(home: string, away: string) {
  return `${home}_vs_${away}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function enrichMatch(match: PrioritizedMatch) {
  const query = sportsDbSearchName(match.home, match.away);
  const date = match.kickoff ? new Intl.DateTimeFormat('en-CA', { timeZone: BRAZIL_TIME_ZONE }).format(new Date(match.kickoff)) : todayInBrazil();
  const search = await fetchJson<{ event?: Array<{ idEvent?: string; strHomeTeamBadge?: string; strAwayTeamBadge?: string }> | null }>(`${SPORTS_DB_BASE}/searchevents.php?e=${encodeURIComponent(query)}&d=${date}`);
  const event = search?.event?.[0];
  if (!event?.idEvent) return match;
  const television = await fetchJson<{ tvevent?: Array<{ strChannel?: string; strCountry?: string }> | null }>(`${SPORTS_DB_BASE}/lookuptv.php?id=${encodeURIComponent(event.idEvent)}`);
  const channels = (television?.tvevent || []).filter((item) => !item.strCountry || /brazil|brasil|worldwide/i.test(item.strCountry)).map((item) => item.strChannel);
  return { ...match, homeLogo: match.homeLogo || event.strHomeTeamBadge, awayLogo: match.awayLogo || event.strAwayTeamBadge, channels: uniqueNames([...match.channels, ...channels]) };
}

async function loadDirectMatches() {
  const date = todayInBrazil();
  try {
    const cached = JSON.parse(localStorage.getItem(SPORTS_CACHE_KEY) || 'null') as { date?: string; expiresAt?: number; matches?: TodayMatch[] } | null;
    if (cached?.date === date && Number(cached.expiresAt) > Date.now() && Array.isArray(cached.matches)) return cached.matches;
  } catch { /* cache inválido */ }

  const results = await Promise.all(competitions.map((config) => loadCompetition(date, config)));
  const unique = new Map<string, PrioritizedMatch>();
  for (const match of results.flat()) {
    const key = `${match.home}|${match.away}|${match.kickoff}`.toLocaleLowerCase('pt-BR');
    if (!unique.has(key)) unique.set(key, match);
  }
  const sorted = [...unique.values()].sort((left, right) => left.competitionPriority - right.competitionPriority || String(left.kickoff).localeCompare(String(right.kickoff)));
  const matches = [...sorted];
  for (let start = 0; start < Math.min(matches.length, 12); start += 4) {
    const enriched = await Promise.all(matches.slice(start, start + 4).map(enrichMatch));
    enriched.forEach((match, offset) => { matches[start + offset] = match; });
  }
  const publicMatches: TodayMatch[] = matches;
  try { localStorage.setItem(SPORTS_CACHE_KEY, JSON.stringify({ date, expiresAt: Date.now() + SPORTS_CACHE_MS, matches: publicMatches })); } catch { /* armazenamento indisponível */ }
  return publicMatches;
}

export async function loadTodayMatches(): Promise<TodayMatch[]> {
  const endpoint = sportsFeedEndpoint();
  if (endpoint) {
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (response.ok) {
        const payload = await response.json() as { matches?: TodayMatch[] } | TodayMatch[];
        const matches = Array.isArray(payload) ? payload : payload.matches;
        if (Array.isArray(matches)) return matches.filter((match) => match?.id && match.home && match.away && match.time);
      }
    } catch { /* usa as fontes públicas diretamente */ }
  }
  return loadDirectMatches();
}

function normalizedName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\b(?:uhd|fhd|full\s*hd|hd|sd|4k|brasil|brazil|canal|channel|ao\s+vivo|live)\b/g, ' ')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function broadcasterQueries(name: string) {
  const normalized = normalizedName(name);
  const queries = new Set<string>([normalized]);
  if (/spor\s*tv/.test(normalized)) { queries.add('sportv'); queries.add('spor tv'); }
  if (normalized.includes('tnt')) { queries.add('tnt sports'); queries.add('tnt'); }
  if (normalized.includes('premiere')) queries.add('premiere');
  if (normalized.includes('globo')) queries.add('globo');
  if (normalized.includes('caze')) { queries.add('cazetv'); queries.add('caze tv'); }
  if (normalized.includes('paramount')) queries.add('paramount');
  if (normalized.includes('disney')) queries.add('disney');
  if (normalized.includes('record')) queries.add('record');
  if (normalized.includes('sbt')) queries.add('sbt');
  if (normalized.includes('max')) queries.add('max');
  if (normalized.includes('espn')) {
    const numberedEspn = normalized.match(/espn\s*([2-9])/);
    queries.add(numberedEspn ? `espn ${numberedEspn[1]}` : 'espn');
  }
  return [...queries].filter((query) => query.length >= 2);
}

function candidateScore(channel: Channel, candidate: string, broadcaster: string) {
  const wanted = normalizedName(broadcaster);
  if (!candidate || !wanted) return 0;
  let score = 0;
  if (candidate === wanted) score += 140;
  if (candidate.includes(wanted)) score += 90;
  if (wanted.includes(candidate)) score += 55;
  const wantedTokens = wanted.split(' ').filter((token) => token.length > 1);
  const candidateTokens = candidate.split(' ');
  score += wantedTokens.filter((token) => candidateTokens.includes(token)).length * 18;

  const wantedNumber = wanted.match(/\b([2-9])\b/)?.[1];
  const candidateNumber = candidate.match(/\b([2-9])\b/)?.[1];
  if (wantedNumber && candidateNumber === wantedNumber) score += 35;
  if (wantedNumber && candidateNumber && candidateNumber !== wantedNumber) score -= 80;
  if (channel.category === 'live') score += 20;
  if (!channel.url?.trim()) score -= 500;
  return score;
}

function bestChannelForBroadcaster(name: string, channels: Array<{ channel: Channel; normalized: string }>) {
  const queries = broadcasterQueries(name);
  return channels
    .map(({ channel, normalized }) => ({
      channel,
      score: Math.max(...queries.map((query) => candidateScore(channel, normalized, query))),
    }))
    .filter((candidate) => candidate.score >= 35)
    .sort((left, right) => right.score - left.score)[0]?.channel;
}

function resolveBroadcastChannels(names: string[], channels: Array<{ channel: Channel; normalized: string }>): ResolvedBroadcast[] {
  const resolved: ResolvedBroadcast[] = [];
  const usedChannelIds = new Set<string>();
  for (const name of names.slice(0, 8)) {
    const channel = bestChannelForBroadcaster(name, channels);
    if (!channel || usedChannelIds.has(channel.id)) continue;
    usedChannelIds.add(channel.id);
    resolved.push({ name, channel });
    if (resolved.length >= 4) break;
  }
  return resolved;
}

export async function resolveMatchesBroadcasts(matches: TodayMatch[]) {
  const liveChannels = await getChannels('live', 50_000);
  const searchableChannels = liveChannels
    .filter((channel) => Boolean(channel.url?.trim()))
    .map((channel) => ({ channel, normalized: normalizedName(channel.name) }));
  return Object.fromEntries(matches.map((match) => [
    match.id,
    resolveBroadcastChannels(match.channels, searchableChannels),
  ])) as Record<string, ResolvedBroadcast[]>;
}
