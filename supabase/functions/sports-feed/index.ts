import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const SPORTS_DB_BASE = "https://www.thesportsdb.com/api/v1/json";
const CACHE_TTL_MS = 10 * 60 * 1000;

const competitions = [
  { slug: "bra.1", priority: 1, fallbackName: "Brasileirão" },
  { slug: "bra.copa_do_brazil", priority: 2, fallbackName: "Copa do Brasil" },
  { slug: "conmebol.libertadores", priority: 3, fallbackName: "Libertadores" },
  { slug: "uefa.champions", priority: 4, fallbackName: "Champions League" },
  { slug: "fifa.worldq.conmebol", priority: 5, fallbackName: "Eliminatórias" },
  { slug: "fifa.friendly", priority: 6, fallbackName: "Seleções" },
  { slug: "bra.2", priority: 7, fallbackName: "Brasileirão Série B" },
] as const;

interface EspnTeam {
  homeAway?: "home" | "away";
  team?: { displayName?: string; shortDisplayName?: string; logo?: string };
}

interface EspnOdds {
  homeTeamOdds?: { moneyLine?: number };
  awayTeamOdds?: { moneyLine?: number };
  drawOdds?: { moneyLine?: number };
}

interface EspnCompetition {
  competitors?: EspnTeam[];
  broadcasts?: Array<{ names?: string[]; shortName?: string }>;
  venue?: { fullName?: string; address?: { city?: string } };
  odds?: EspnOdds[];
}

interface EspnEvent {
  id?: string;
  date?: string;
  name?: string;
  competitions?: EspnCompetition[];
  status?: { type?: { state?: string; detail?: string; shortDetail?: string } };
}

interface EspnPayload {
  events?: EspnEvent[];
  leagues?: Array<{ name?: string; abbreviation?: string }>;
}

interface SportsDbEvent {
  idEvent?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
}

interface SportsDbTvEvent {
  strChannel?: string;
  strCountry?: string;
}

interface MatchProbability {
  home: number;
  draw: number;
  away: number;
  source: "market" | "baseline";
}

interface MatchItem {
  id: string;
  competition: string;
  competitionPriority: number;
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  venue?: string;
  kickoff: string;
  time: string;
  status?: string;
  channels: string[];
  probabilities: MatchProbability;
}

let memoryCache: { date: string; expiresAt: number; payload: unknown } | null = null;

function dateInBrazil(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function timeInBrazil(isoDate: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function uniqueNames(values: Array<string | undefined>) {
  const found = new Map<string, string>();
  for (const value of values) {
    const name = value?.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("pt-BR");
    if (!found.has(key)) found.set(key, name);
  }
  return [...found.values()];
}

function americanOddsProbability(value?: number) {
  if (!value || !Number.isFinite(value)) return null;
  return value > 0 ? 100 / (value + 100) : Math.abs(value) / (Math.abs(value) + 100);
}

function probabilitiesFor(eventId: string, odds?: EspnOdds): MatchProbability {
  const home = americanOddsProbability(odds?.homeTeamOdds?.moneyLine);
  const draw = americanOddsProbability(odds?.drawOdds?.moneyLine);
  const away = americanOddsProbability(odds?.awayTeamOdds?.moneyLine);
  if (home && draw && away) {
    const total = home + draw + away;
    const normalizedHome = Math.round((home / total) * 100);
    const normalizedDraw = Math.round((draw / total) * 100);
    return {
      home: normalizedHome,
      draw: normalizedDraw,
      away: 100 - normalizedHome - normalizedDraw,
      source: "market",
    };
  }

  let hash = 0;
  for (const character of eventId) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  const adjustment = Math.abs(hash) % 11 - 5;
  const baselineHome = 41 + adjustment;
  const baselineDraw = 29 - Math.round(adjustment / 3);
  return {
    home: baselineHome,
    draw: baselineDraw,
    away: 100 - baselineHome - baselineDraw,
    source: "baseline",
  };
}

function sportsDbSearchName(home: string, away: string) {
  return `${home}_vs_${away}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "NexusPlay/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function loadCompetition(date: string, config: typeof competitions[number]) {
  const compactDate = date.replaceAll("-", "");
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${config.slug}/scoreboard?dates=${compactDate}&region=br&lang=pt`;
  const payload = await fetchJson<EspnPayload>(url);
  const competitionName = payload?.leagues?.[0]?.name || config.fallbackName;

  return (payload?.events || []).flatMap<MatchItem>((event) => {
    const details = event.competitions?.[0];
    const homeTeam = details?.competitors?.find((team) => team.homeAway === "home")?.team;
    const awayTeam = details?.competitors?.find((team) => team.homeAway === "away")?.team;
    const home = homeTeam?.displayName || homeTeam?.shortDisplayName;
    const away = awayTeam?.displayName || awayTeam?.shortDisplayName;
    if (!event.id || !event.date || !home || !away) return [];

    const channels = uniqueNames((details?.broadcasts || []).flatMap((broadcast) =>
      broadcast.names?.length ? broadcast.names : [broadcast.shortName]
    ));
    const venue = [details?.venue?.fullName, details?.venue?.address?.city].filter(Boolean).join(" • ");
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

async function enrichWithSportsDb(match: MatchItem, apiKey: string) {
  const query = sportsDbSearchName(match.home, match.away);
  if (!query) return match;

  const matchDate = dateInBrazil(new Date(match.kickoff));
  const searchUrl = `${SPORTS_DB_BASE}/${encodeURIComponent(apiKey)}/searchevents.php?e=${encodeURIComponent(query)}&d=${encodeURIComponent(matchDate)}`;
  const search = await fetchJson<{ event?: SportsDbEvent[] | null }>(searchUrl);
  const event = search?.event?.[0];
  if (!event?.idEvent) return match;

  const tvUrl = `${SPORTS_DB_BASE}/${encodeURIComponent(apiKey)}/lookuptv.php?id=${encodeURIComponent(event.idEvent)}`;
  const tv = await fetchJson<{ tvevent?: SportsDbTvEvent[] | null }>(tvUrl);
  const tvNames = (tv?.tvevent || [])
    .filter((item) => !item.strCountry || /brazil|brasil|worldwide/i.test(item.strCountry))
    .map((item) => item.strChannel);

  return {
    ...match,
    homeLogo: match.homeLogo || event.strHomeTeamBadge,
    awayLogo: match.awayLogo || event.strAwayTeamBadge,
    channels: uniqueNames([...match.channels, ...tvNames]),
  };
}

async function enrichInBatches(matches: MatchItem[], apiKey: string) {
  const result = [...matches];
  const limit = Math.min(result.length, 12);
  for (let start = 0; start < limit; start += 4) {
    const batch = result.slice(start, Math.min(start + 4, limit));
    const enriched = await Promise.all(batch.map((match) => enrichWithSportsDb(match, apiKey)));
    enriched.forEach((match, offset) => { result[start + offset] = match; });
  }
  return result;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "GET") return json({ error: "Método não permitido." }, 405);

  const requestedDate = new URL(request.url).searchParams.get("date") || dateInBrazil();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return json({ error: "Data inválida." }, 400);

  if (memoryCache?.date === requestedDate && memoryCache.expiresAt > Date.now()) {
    return json(memoryCache.payload);
  }

  const results = await Promise.allSettled(competitions.map((config) => loadCompetition(requestedDate, config)));
  const deduplicated = new Map<string, MatchItem>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const match of result.value) {
      const key = `${match.home}|${match.away}|${match.kickoff}`.toLocaleLowerCase("pt-BR");
      if (!deduplicated.has(key)) deduplicated.set(key, match);
    }
  }

  const sorted = [...deduplicated.values()].sort((left, right) =>
    left.competitionPriority - right.competitionPriority || left.kickoff.localeCompare(right.kickoff)
  );
  const sportsDbApiKey = Deno.env.get("SPORTSDB_API_KEY")?.trim() || "123";
  const matches = await enrichInBatches(sorted, sportsDbApiKey);
  const payload = {
    date: requestedDate,
    updatedAt: new Date().toISOString(),
    source: "ESPN + TheSportsDB",
    matches,
  };
  memoryCache = { date: requestedDate, expiresAt: Date.now() + CACHE_TTL_MS, payload };
  return json(payload);
});
