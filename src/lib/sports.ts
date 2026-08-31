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

function sportsFeedEndpoint() {
  const custom = (import.meta.env.VITE_SPORTS_FEED_URL as string | undefined)?.trim();
  if (custom) return custom;
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/$/, '');
  return supabaseUrl ? `${supabaseUrl}/functions/v1/sports-feed` : '';
}

export async function loadTodayMatches(): Promise<TodayMatch[]> {
  const endpoint = sportsFeedEndpoint();
  if (!endpoint) throw new Error('A agenda esportiva ainda não foi configurada.');
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Agenda esportiva indisponível (${response.status})`);
  const payload = await response.json() as { matches?: TodayMatch[] } | TodayMatch[];
  const matches = Array.isArray(payload) ? payload : payload.matches;
  if (!Array.isArray(matches)) return [];
  return matches.filter((match) => match?.id && match.home && match.away && match.time);
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
