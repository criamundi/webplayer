import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createClient,
} from "npm:@supabase/supabase-js@2.57.4";
import { fetchProvider } from "../_shared/provider-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",

  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",

  "Access-Control-Expose-Headers":
    "X-Provider-Stream-Base",
};

const supabaseUrl =
  Deno.env.get(
    "SUPABASE_URL",
  ) ?? "";

const serviceRoleKey =
  Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY",
  ) ?? "";

const tmdbReadToken = Deno.env.get("TMDB_READ_TOKEN") ?? "";

const adminClient =
  createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession:
          false,
      },
    },
  );

type UpstreamAccountState = {
  authenticated: boolean;
  status: string;
  expiresAt: string | null;
  username?: string | null;
  displayName?: string | null;
  activeConnections: number;
  maxConnections: number | null;
  allowed: boolean;
};

const upstreamAccountCache = new Map<string, {
  expiresAt: number;
  account: UpstreamAccountState;
}>();

const UPSTREAM_ACCOUNT_CACHE_MS = 60_000;

function accountCacheKey(providerId: string, username: string) {
  return `${providerId}:${username.toLowerCase()}`;
}

/*
|--------------------------------------------------------------------------
| JSON
|--------------------------------------------------------------------------
*/

function json(
  body: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(
      body,
    ),
    {
      status,

      headers: {
        ...corsHeaders,

        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store",
      },
    },
  );
}

/*
|--------------------------------------------------------------------------
| VALIDA URL
|--------------------------------------------------------------------------
*/

function validServerUrl(
  value: string,
): URL | null {
  try {
    const url =
      new URL(
        value.trim(),
      );

    if (
      url.protocol !==
        "http:" &&
      url.protocol !==
        "https:"
    ) {
      return null;
    }

    const host =
      url.hostname
        .toLowerCase();

    /*
     * Bloqueia hosts locais.
     */
    if (
      host ===
        "localhost" ||
      host ===
        "127.0.0.1" ||
      host ===
        "0.0.0.0" ||
      host ===
        "::1" ||
      host.endsWith(
        ".local",
      ) ||
      host.startsWith(
        "10.",
      ) ||
      host.startsWith(
        "192.168.",
      ) ||
      host.startsWith(
        "169.254.",
      )
    ) {
      return null;
    }

    /*
     * 172.16.0.0 até
     * 172.31.255.255
     */
    const match =
      host.match(
        /^172\.(\d+)\./,
      );

    if (match) {
      const second =
        Number(
          match[1],
        );

      if (
        second >= 16 &&
        second <= 31
      ) {
        return null;
      }
    }

    return url;
  } catch {
    return null;
  }
}

function playerApiUrl(server: URL, username: string, password: string) {
  const url = new URL(server.toString());
  const basePath = url.pathname.toLowerCase().endsWith(".php")
    ? url.pathname.slice(0, url.pathname.lastIndexOf("/"))
    : url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}/player_api.php`;
  url.search = new URLSearchParams({ username, password }).toString();
  return url;
}

function upstreamState(raw: Record<string, unknown>): UpstreamAccountState {
  const user = raw?.user_info && typeof raw.user_info === "object"
    ? raw.user_info as Record<string, unknown>
    : {};
  const authenticated = String(user.auth ?? "0") === "1";
  const status = String(user.status ?? "").trim();
  const expSeconds = Number(user.exp_date ?? 0);
  const expiresAt = Number.isFinite(expSeconds) && expSeconds > 0
    ? new Date(expSeconds * 1000).toISOString()
    : null;
  const upstreamUsername = String(user.username ?? "").trim();
  const displayName = String(
    user.name ??
    user.full_name ??
    user.display_name ??
    upstreamUsername
  ).trim();

  return {
    authenticated,
    status,
    expiresAt,
    username: upstreamUsername || null,
    displayName: displayName || null,
    activeConnections: Number(user.active_cons ?? 0) || 0,
    maxConnections: Number(user.max_connections ?? 0) || null,
    allowed: authenticated && status.toLowerCase() === "active" && (!expiresAt || new Date(expiresAt) > new Date()),
  };
}

/*
|--------------------------------------------------------------------------
| EDGE FUNCTION
|--------------------------------------------------------------------------
*/

Deno.serve(
  async (
    req: Request,
  ) => {
    /*
    |--------------------------------------------------------------------------
    | CORS
    |--------------------------------------------------------------------------
    */

    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers:
            corsHeaders,
        },
      );
    }

    if (
      req.method !==
      "POST"
    ) {
      return json(
        {
          error:
            "Método não permitido.",
        },
        405,
      );
    }

    /*
     * Se o usuário cancelar no navegador,
     * essa função também cancela o fetch
     * que está aberto com o IPTV.
     */
    const controller =
      new AbortController();

    let timeoutId:
      number | null =
      null;

    let timedOut =
      false;

    const abortFromClient =
      () => {
        if (
          !controller.signal
            .aborted
        ) {
          controller.abort();
        }
      };

    req.signal.addEventListener(
      "abort",
      abortFromClient,
      {
        once: true,
      },
    );

    try {
      /*
      |--------------------------------------------------------------------------
      | CREDENCIAIS RECEBIDAS
      |--------------------------------------------------------------------------
      */

      const body =
        await req.json();

      const username =
        typeof body.username ===
        "string"
          ? body.username.trim()
          : "";

      const password =
        typeof body.password ===
        "string"
          ? body.password
          : "";

      const providerName =
        typeof body.provider ===
        "string"
          ? body.provider.trim()
          : "";

      const action =
        body.action === "content-info" || body.action === "home-catalog" || body.action === "account-status" || body.action === "live-catalog" || body.action === "live-epg" || body.action === "movie-catalog" || body.action === "series-catalog" || body.action === "series-info" || body.action === "series-content-info" || body.action === "series-season-images"
          ? body.action
          : "playlist";

      const streamId =
        typeof body.streamId === "string" && /^\d+$/.test(body.streamId)
          ? body.streamId
          : "";

      const contentName = typeof body.contentName === "string"
        ? body.contentName.slice(0, 240).trim()
        : "";

      const contentYear = typeof body.contentYear === "string"
        ? body.contentYear.match(/(?:19|20)\d{2}/)?.[0] ?? ""
        : "";

      const requestedTmdbId = typeof body.tmdbId === "string" && /^\d+$/.test(body.tmdbId)
        ? body.tmdbId
        : "";

      const requestedSeason = Number.isInteger(body.season) && body.season >= 0 && body.season <= 100
        ? Number(body.season)
        : -1;

      if (
        username.length <
          1 ||
        username.length >
          120 ||
        password.length <
          1 ||
        password.length >
          200 ||
        providerName.length <
          1 ||
        providerName.includes("%") ||
        providerName.includes("_")
      ) {
        return json(
          {
            error:
              "Credenciais inválidas.",
          },
          400,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | PROVEDOR
      |--------------------------------------------------------------------------
      */

      const {
        data:
          providerRow,

        error:
          providerError,
      } =
        await adminClient
          .from(
            "iptv_providers",
          )
          .select(
            "id, name, active, auto_registration, default_dns_id, server_url, renewal_url",
          )
          .ilike(
            "name",
            providerName,
          )
          .maybeSingle();

      if (
        providerError ||
        !providerRow
      ) {
        return json(
          {
            error:
              "Provedor não encontrado.",
          },
          401,
        );
      }

      if (
        !providerRow.active
      ) {
        return json(
          {
            error:
              "Provedor indisponível no momento.",
          },
          503,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | LINHA
      |--------------------------------------------------------------------------
      */

      const { data: existingLine, error: lineError } =
        await adminClient
          .from(
            "iptv_lines",
          )
          .select(`
            id,
            username,
            password,
            provider_id,
            dns_id,
            local_enabled,
            upstream_expires_at,
            status,
            iptv_dns(
              id,
              name,
              host,
              active
            )
          `)
          .eq(
            "username",
            username,
          )
          .eq(
            "provider_id",
            providerRow.id,
          )
          .maybeSingle();

      if (lineError) {
        return json(
          {
            error: "Não foi possível consultar este acesso.",
          },
          500,
        );
      }

      if (existingLine && existingLine.local_enabled === false) {
        return json({ error: "Este dispositivo foi desativado pelo administrador." }, 403);
      }

      let dns = existingLine?.iptv_dns as {
          id: string;
          name: string;
          host: string;
          active: boolean;
        } | null | undefined;

      if (!dns && providerRow.default_dns_id) {
        const { data: defaultDns } = await adminClient.from("iptv_dns")
          .select("id, name, host, active")
          .eq("id", providerRow.default_dns_id)
          .maybeSingle();
        dns = defaultDns ?? undefined;
      }

      const rawHost = dns?.host || providerRow.server_url || "";
      if (!rawHost) {
        return json(
          {
            error: "O provedor ainda não possui um DNS padrão configurado.",
          },
          502,
        );
      }

      if (dns && !dns.active) {
        return json(
          {
            error:
              "O DNS vinculado a esta linha está desativado.",
          },
          502,
        );
      }

      const serverUrl =
        validServerUrl(
          rawHost,
        );

      if (!serverUrl) {
        return json(
          {
            error:
              "O DNS configurado no Admin é inválido.",
          },
          502,
        );
      }

      /* A conta real do provedor continua sendo a fonte de status.
       * Porém, ações auxiliares não devem consultar player_api.php
       * repetidamente em poucos segundos.
       */
      const cacheKey = accountCacheKey(providerRow.id, username);
      const cachedAccount = upstreamAccountCache.get(cacheKey);
      const requireFreshAccount = action === "account-status" || action === "playlist";
      let account: UpstreamAccountState;

      if (!requireFreshAccount && cachedAccount && cachedAccount.expiresAt > Date.now()) {
        account = cachedAccount.account;
      } else {
        let upstreamResponse: Response;
        let upstreamPayload: Record<string, unknown>;
        try {
          upstreamResponse = await fetchProvider(playerApiUrl(serverUrl, username, password), {
            headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
            redirect: "follow",
            signal: controller.signal,
          });
          if (!upstreamResponse.ok) throw new Error("provider status");
          upstreamPayload = await upstreamResponse.json();
        } catch {
          return json({ error: "Não foi possível validar a conta no provedor agora." }, 502);
        }

        account = upstreamState(upstreamPayload);

        if (account.allowed) {
          upstreamAccountCache.set(cacheKey, {
            expiresAt: Date.now() + UPSTREAM_ACCOUNT_CACHE_MS,
            account,
          });
        } else {
          upstreamAccountCache.delete(cacheKey);
        }
      }
      if (!account.authenticated) {
        return json({ error: "Usuário ou senha inválidos no provedor." }, 401);
      }
      if (!account.allowed) {
        const expired = account.expiresAt && new Date(account.expiresAt) <= new Date();
        return json({ error: expired ? "Esta conta está vencida no provedor." : `Esta conta está ${account.status || "inativa"} no provedor.` }, 403);
      }

      let line = existingLine;
      const synchronized = {
        password,
        status: "active",
        upstream_status: account.status,
        upstream_expires_at: account.expiresAt,
        expires_at: account.expiresAt,
        upstream_active_connections: account.activeConnections,
        upstream_max_connections: account.maxConnections,
        last_synced_at: new Date().toISOString(),
      };

      if (!line) {
        if (!providerRow.auto_registration) {
          return json({ error: "A conta existe no provedor, mas o cadastro automático está desativado. Solicite a liberação ao administrador." }, 403);
        }
        const { data: created, error: createError } = await adminClient.from("iptv_lines").insert({
          username,
          provider_id: providerRow.id,
          dns_id: dns?.id ?? providerRow.default_dns_id ?? null,
          local_enabled: true,
          registration_source: "automatic",
          ...synchronized,
        }).select("id, username, password, provider_id, dns_id, local_enabled, upstream_expires_at, status").single();
        if (createError || !created) return json({ error: "A conta foi validada, mas não foi possível concluir o cadastro automático." }, 500);
        line = created;
      } else {
        await adminClient.from("iptv_lines").update(synchronized).eq("id", line.id);
      }

      if (action === "account-status") {
        const expiresAt = account.expiresAt ? new Date(account.expiresAt) : null;
        const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : null;
        return json({
          expiresAt: account.expiresAt,
          daysRemaining,
          status: account.status,
          username: account.username ?? username,
          displayName: account.displayName ?? account.username ?? username,
          renewalUrl: providerRow.renewal_url ?? null,
        });
      }

      if (action === "live-catalog") {
        const makeLiveApiUrl = (apiAction: string) => {
          const url = new URL(serverUrl.toString());
          const basePath = url.pathname.toLowerCase().endsWith(".php") ? url.pathname.slice(0, url.pathname.lastIndexOf("/")) : url.pathname.replace(/\/$/, "");
          url.pathname = `${basePath}/player_api.php`;
          url.search = new URLSearchParams({ username, password, action: apiAction }).toString();
          return url;
        };
        const liveController = new AbortController();
        const liveTimeout = setTimeout(() => liveController.abort(), 30000);
        try {
          const [categoriesResponse, streamsResponse] = await Promise.all([
            fetchProvider(makeLiveApiUrl("get_live_categories"), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: liveController.signal }),
            fetchProvider(makeLiveApiUrl("get_live_streams"), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: liveController.signal }),
          ]);
          if (!categoriesResponse.ok || !streamsResponse.ok) return json({ error: "Catálogo de canais indisponível." }, 502);
          const categoriesRaw = await categoriesResponse.json();
          const streamsRaw = await streamsResponse.json();
          const categories = (Array.isArray(categoriesRaw) ? categoriesRaw : []).map((item: Record<string, unknown>) => ({
            id: String(item.category_id ?? ""),
            name: String(item.category_name ?? "Sem categoria"),
          })).filter((item: { id: string }) => item.id);
          const categoryNames = new Map(categories.map((item: { id: string; name: string }) => [item.id, item.name]));
          const categoryOrder = new Map(categories.map((item: { id: string }, index: number) => [item.id, index]));
          const root = new URL(serverUrl.toString());
          const rootPath = root.pathname.toLowerCase().endsWith(".php") ? root.pathname.slice(0, root.pathname.lastIndexOf("/")) : root.pathname.replace(/\/$/, "");
          const streams = (Array.isArray(streamsRaw) ? streamsRaw : [])
            .map((item: Record<string, unknown>, sourceIndex: number) => {
              const streamId = String(item.stream_id ?? "");
              const categoryId = String(item.category_id ?? "");
              const channelNumber = Number(item.num ?? 0);
              const extension = String(item.container_extension ?? "ts").replace(/[^a-z0-9]/gi, "") || "ts";
              return {
                id: `live:${streamId}`,
                streamId,
                categoryId,
                channelNumber: Number.isFinite(channelNumber) && channelNumber > 0 ? channelNumber : null,
                sourceIndex,
                name: String(item.name ?? "Sem nome"),
                url: `${root.origin}${rootPath}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${extension}`,
                logo: String(item.stream_icon ?? ""),
                group: categoryNames.get(categoryId) ?? "Outros",
                tvgId: String(item.epg_channel_id ?? ""),
                category: "live",
              };
            })
            .filter((item: { streamId: string }) => item.streamId)
            .sort((a: { categoryId: string; sourceIndex: number }, b: { categoryId: string; sourceIndex: number }) => {
              const aCategory = categoryOrder.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER;
              const bCategory = categoryOrder.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER;
              return aCategory - bCategory || a.sourceIndex - b.sourceIndex;
            })
            .map((item: { sourceIndex: number; [key: string]: unknown }) => {
              const result: Record<string, unknown> = { ...item };
              delete result.sourceIndex;
              return result;
            });
          return json({ categories, channels: streams });
        } catch {
          return json({ error: "Não foi possível carregar os canais ao vivo." }, 502);
        } finally {
          clearTimeout(liveTimeout);
        }
      }

      if (action === "live-epg") {
        if (!streamId) return json({ error: "Canal inválido." }, 400);

        const makeEpgUrl = (apiAction: string, extra: Record<string, string> = {}) => {
          const url = new URL(serverUrl.toString());
          const basePath = url.pathname.toLowerCase().endsWith(".php")
            ? url.pathname.slice(0, url.pathname.lastIndexOf("/"))
            : url.pathname.replace(/\/$/, "");
          url.pathname = `${basePath}/player_api.php`;
          url.search = new URLSearchParams({
            username,
            password,
            action: apiAction,
            stream_id: streamId,
            ...extra,
          }).toString();
          return url;
        };

        const decodeText = (value: unknown) => {
          const raw = String(value ?? "").trim();
          if (!raw || raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return raw;
          try {
            const bytes = Uint8Array.from(atob(raw), (character) => character.charCodeAt(0));
            const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
            const hasControlCharacter = Array.from(decoded).some((character) => {
              const code = character.charCodeAt(0);
              return code < 32 && code !== 9 && code !== 10 && code !== 13;
            });
            return decoded && !hasControlCharacter ? decoded : raw;
          } catch {
            return raw;
          }
        };

        const toIso = (timestamp: unknown, date: unknown) => {
          const seconds = Number(timestamp ?? 0);
          if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
          const parsed = Date.parse(String(date ?? ""));
          return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
        };

        const normalizeListings = (payload: Record<string, unknown>) => {
          const listings = Array.isArray(payload?.epg_listings) ? payload.epg_listings : [];
          return listings
            .map((item: Record<string, unknown>) => ({
              title: decodeText(item.title),
              description: decodeText(item.description),
              start: toIso(item.start_timestamp, item.start),
              end: toIso(item.stop_timestamp, item.end),
            }))
            .filter((item: { title: string; start: string }) => item.title && item.start)
            .sort((left: { start: string }, right: { start: string }) => left.start.localeCompare(right.start));
        };

        const epgController = new AbortController();
        const epgTimeout = setTimeout(() => epgController.abort(), 15000);

        try {
          let programs: Array<{ title: string; description?: string; start?: string; end?: string }> = [];

          /* Primeiro tenta a grade ampla do canal. */
          try {
            const response = await fetchProvider(makeEpgUrl("get_simple_data_table"), {
              headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
              signal: epgController.signal,
            });
            if (response.ok) {
              const payload = await response.json();
              programs = normalizeListings(payload);
            }
          } catch {
            /* fallback abaixo */
          }

          /* Alguns servidores não oferecem get_simple_data_table. */
          if (!programs.length) {
            const response = await fetchProvider(makeEpgUrl("get_short_epg", { limit: "96" }), {
              headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
              signal: epgController.signal,
            });
            if (response.ok) {
              const payload = await response.json();
              programs = normalizeListings(payload);
            }
          }

          const brazilDateKey = (value: string | Date) => new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(typeof value === "string" ? new Date(value) : value);

          const todayKey = brazilDateKey(new Date());
          const dayPrograms = programs.filter((item) => item.start && brazilDateKey(item.start) === todayKey);
          const visiblePrograms = dayPrograms.length ? dayPrograms : programs;

          const now = Date.now();
          const currentIndex = visiblePrograms.findIndex((item) => {
            const startAt = Date.parse(item.start || "");
            const endAt = Date.parse(item.end || "");
            return Number.isFinite(startAt) && Number.isFinite(endAt) && startAt <= now && now < endAt;
          });

          const selectedIndex = currentIndex >= 0 ? currentIndex : 0;

          return json({
            current: visiblePrograms[selectedIndex] ?? null,
            next: visiblePrograms[selectedIndex + 1] ?? null,
            programs: visiblePrograms,
          });
        } catch {
          return json({ current: null, next: null, programs: [] });
        } finally {
          clearTimeout(epgTimeout);
        }
      }

      if (action === "movie-catalog") {
        const makeMovieApiUrl = (apiAction: string) => {
          const url = new URL(serverUrl.toString());
          const basePath = url.pathname.toLowerCase().endsWith(".php") ? url.pathname.slice(0, url.pathname.lastIndexOf("/")) : url.pathname.replace(/\/$/, "");
          url.pathname = `${basePath}/player_api.php`;
          url.search = new URLSearchParams({ username, password, action: apiAction }).toString();
          return url;
        };
        const movieController = new AbortController();
        const movieTimeout = setTimeout(() => movieController.abort(), 45000);
        try {
          const [categoriesResponse, moviesResponse] = await Promise.all([
            fetchProvider(makeMovieApiUrl("get_vod_categories"), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: movieController.signal }),
            fetchProvider(makeMovieApiUrl("get_vod_streams"), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: movieController.signal }),
          ]);
          if (!categoriesResponse.ok || !moviesResponse.ok) return json({ error: "Catálogo de filmes indisponível." }, 502);
          const categoriesRaw = await categoriesResponse.json();
          const moviesRaw = await moviesResponse.json();
          const categories = (Array.isArray(categoriesRaw) ? categoriesRaw : []).map((item: Record<string, unknown>) => ({ id: String(item.category_id ?? ""), name: String(item.category_name ?? "Sem categoria") })).filter((item: { id: string }) => item.id);
          const root = new URL(serverUrl.toString());
          const rootPath = root.pathname.toLowerCase().endsWith(".php") ? root.pathname.slice(0, root.pathname.lastIndexOf("/")) : root.pathname.replace(/\/$/, "");
          const movies = (Array.isArray(moviesRaw) ? moviesRaw : []).map((item: Record<string, unknown>) => {
            const movieId = String(item.stream_id ?? "");
            const extension = String(item.container_extension ?? "mp4").replace(/[^a-z0-9]/gi, "") || "mp4";
            return {
              id: `movie:${movieId}`, movieId, name: String(item.name ?? "Sem título"),
              categoryId: String(item.category_id ?? ""), logo: String(item.stream_icon ?? item.cover ?? ""),
              backdrop: Array.isArray(item.backdrop_path) ? String(item.backdrop_path[0] ?? "") : String(item.backdrop_path ?? ""),
              plot: String(item.plot ?? ""), genre: String(item.genre ?? ""), rating: String(item.rating_5based ?? item.rating ?? ""),
              releaseDate: String(item.releaseDate ?? item.release_date ?? ""), added: String(item.added ?? ""),
              url: `${root.origin}${rootPath}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${movieId}.${extension}`,
            };
          }).filter((item: { movieId: string }) => item.movieId);
          return json({ categories, movies });
        } catch {
          return json({ error: "Não foi possível carregar os filmes." }, 502);
        } finally {
          clearTimeout(movieTimeout);
        }
      }

      if (action === "series-catalog" || action === "series-info" || action === "series-content-info" || action === "series-season-images") {
        const makeSeriesApiUrl = (apiAction: string, extra: Record<string, string> = {}) => {
          const url = new URL(serverUrl.toString());
          const basePath = url.pathname.toLowerCase().endsWith(".php") ? url.pathname.slice(0, url.pathname.lastIndexOf("/")) : url.pathname.replace(/\/$/, "");
          url.pathname = `${basePath}/player_api.php`;
          url.search = new URLSearchParams({ username, password, action: apiAction, ...extra }).toString();
          return url;
        };
        const seriesController = new AbortController();
        const seriesTimeout = setTimeout(() => seriesController.abort(), 18000);
        try {
          if (action === "series-season-images") {
            if (!tmdbReadToken || !requestedTmdbId || requestedSeason < 0) return json({ images: {} });
            const seasonUrl = new URL(`https://api.themoviedb.org/3/tv/${requestedTmdbId}/season/${requestedSeason}`);
            seasonUrl.search = new URLSearchParams({ language: "pt-BR" }).toString();
            const seasonResponse = await fetch(seasonUrl, {
              headers: { Authorization: `Bearer ${tmdbReadToken}`, Accept: "application/json" },
              signal: seriesController.signal,
            });
            if (!seasonResponse.ok) return json({ images: {} });
            const seasonData = await seasonResponse.json();
            const images = Object.fromEntries((Array.isArray(seasonData?.episodes) ? seasonData.episodes : [])
              .filter((episode: Record<string, unknown>) => Number(episode.episode_number) > 0 && typeof episode.still_path === "string" && episode.still_path)
              .map((episode: Record<string, unknown>) => [String(episode.episode_number), `https://image.tmdb.org/t/p/w780${episode.still_path}`]));
            return json({ images });
          }

          if (action === "series-catalog") {
            const [categoriesResponse, showsResponse] = await Promise.all([
              fetchProvider(makeSeriesApiUrl("get_series_categories"), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: seriesController.signal }),
              fetchProvider(makeSeriesApiUrl("get_series"), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: seriesController.signal }),
            ]);
            if (!categoriesResponse.ok || !showsResponse.ok) return json({ error: "Catálogo de séries indisponível." }, 502);
            const categoriesRaw = await categoriesResponse.json();
            const showsRaw = await showsResponse.json();
            const categories = (Array.isArray(categoriesRaw) ? categoriesRaw : []).map((item: Record<string, unknown>) => ({ id: String(item.category_id ?? ""), name: String(item.category_name ?? "Sem categoria") })).filter((item: { id: string }) => item.id);
            const shows = (Array.isArray(showsRaw) ? showsRaw : []).map((item: Record<string, unknown>) => ({
              id: `series:${item.series_id}`, seriesId: String(item.series_id ?? ""), name: String(item.name ?? "Sem título"),
              categoryId: String(item.category_id ?? ""), logo: String(item.cover ?? item.stream_icon ?? ""),
              backdrop: Array.isArray(item.backdrop_path) ? String(item.backdrop_path[0] ?? "") : String(item.backdrop_path ?? ""),
              plot: String(item.plot ?? ""), genre: String(item.genre ?? ""), rating: String(item.rating_5based ?? item.rating ?? ""),
              releaseDate: String(item.releaseDate ?? item.release_date ?? ""), added: String(item.last_modified ?? item.added ?? ""), url: "",
            })).filter((item: { seriesId: string }) => item.seriesId);
            return json({ categories, shows });
          }
          if (!streamId) return json({ error: "Série inválida." }, 400);
          const response = await fetchProvider(makeSeriesApiUrl("get_series_info", { series_id: streamId }), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: seriesController.signal });
          if (!response.ok) return json({ error: "Informações da série indisponíveis." }, 502);
          const raw = await response.json();
          const info = raw?.info && typeof raw.info === "object" ? raw.info as Record<string, unknown> : {};
          const root = new URL(serverUrl.toString());
          const rootPath = root.pathname.toLowerCase().endsWith(".php") ? root.pathname.slice(0, root.pathname.lastIndexOf("/")) : root.pathname.replace(/\/$/, "");
          const episodesSource = action === "series-content-info"
            ? {}
            : raw?.episodes && typeof raw.episodes === "object" ? raw.episodes : {};
          const episodes = Object.entries(episodesSource).flatMap(([seasonKey, list]) => (Array.isArray(list) ? list : []).map((episode: Record<string, unknown>, index: number) => {
            const id = String(episode.id ?? "");
            const extension = String(episode.container_extension ?? "mp4").replace(/[^a-z0-9]/gi, "") || "mp4";
            const episodeInfo = episode.info && typeof episode.info === "object" ? episode.info as Record<string, unknown> : {};
            return { id: `episode:${id}`, name: String(episode.title ?? `Episódio ${index + 1}`), url: `${root.origin}${rootPath}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${id}.${extension}`, logo: String(episodeInfo.movie_image ?? info.cover ?? ""), season: Number(episode.season ?? seasonKey ?? 1), episode: Number(episode.episode_num ?? index + 1), duration: String(episodeInfo.duration ?? ""), plot: String(episodeInfo.plot ?? "") };
          })).filter((episode: { id: string }) => episode.id !== "episode:");
          let enrichedInfo = info;
          if (tmdbReadToken) {
            const tmdbFetch = async (path: string, params: Record<string, string>) => {
              const url = new URL(`https://api.themoviedb.org/3${path}`);
              url.search = new URLSearchParams(params).toString();
              return fetch(url, {
                headers: { Authorization: `Bearer ${tmdbReadToken}`, Accept: "application/json" },
                signal: seriesController.signal,
              });
            };

            try {
              let tmdbId = String(info.tmdb_id ?? info.tmdb ?? "").replace(/\D/g, "");
              const seriesTitle = String(info.name ?? info.title ?? contentName)
                .replace(/\s*\[(?:E|LEG|DUB)\].*$/i, "")
                .trim();
              const providerYear = String(info.releaseDate ?? info.release_date ?? "")
                .match(/(?:19|20)\d{2}/)?.[0] ?? contentYear;

              if (!tmdbId && seriesTitle) {
                const searchResponse = await tmdbFetch("/search/tv", {
                  query: seriesTitle,
                  language: "pt-BR",
                  include_adult: "false",
                  ...(providerYear ? { first_air_date_year: providerYear } : {}),
                });
                if (searchResponse.ok) {
                  const search = await searchResponse.json();
                  tmdbId = String(search?.results?.[0]?.id ?? "");
                }
              }

              if (tmdbId) {
                const detailResponse = await tmdbFetch(`/tv/${tmdbId}`, {
                  language: "pt-BR",
                  append_to_response: "credits,images,videos,content_ratings,external_ids",
                  include_image_language: "pt,en,null",
                  include_video_language: "pt-BR,pt,en-US,en,null",
                });
                if (detailResponse.ok) {
                  const detail = await detailResponse.json();
                  const imageUrl = (path: unknown, size = "original") => typeof path === "string" && path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
                  const castMembers = Array.isArray(detail?.credits?.cast)
                    ? detail.credits.cast.slice(0, 12).map((item: Record<string, unknown>) => ({
                      name: String(item.name ?? ""),
                      character: String(item.character ?? ""),
                      image: imageUrl(item.profile_path, "w342"),
                    })).filter((item: { name: string }) => item.name)
                    : [];
                  const cast = castMembers.map((item: { name: string }) => item.name).join(", ");
                  const backdrop = typeof detail?.backdrop_path === "string" && detail.backdrop_path
                    ? `https://image.tmdb.org/t/p/original${detail.backdrop_path}`
                    : "";
                  const logos = Array.isArray(detail?.images?.logos) ? detail.images.logos : [];
                  const logoRank = (item: Record<string, unknown>) => item.iso_639_1 === "pt" ? 3 : item.iso_639_1 === "en" ? 2 : 1;
                  logos.sort((a: Record<string, unknown>, b: Record<string, unknown>) => logoRank(b) - logoRank(a) || Number(b.vote_average ?? 0) - Number(a.vote_average ?? 0));
                  const videos = Array.isArray(detail?.videos?.results) ? detail.videos.results : [];
                  const trailer = videos
                    .filter((item: Record<string, unknown>) => item.site === "YouTube" && (item.type === "Trailer" || item.type === "Teaser"))
                    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.official === true) - Number(a.official === true) || (b.type === "Trailer" ? 1 : 0) - (a.type === "Trailer" ? 1 : 0))[0];
                  const contentRatings = Array.isArray(detail?.content_ratings?.results) ? detail.content_ratings.results : [];
                  const contentRating = contentRatings.find((item: Record<string, unknown>) => item.iso_3166_1 === "BR")
                    ?? contentRatings.find((item: Record<string, unknown>) => item.iso_3166_1 === "US");
                  const creators = Array.isArray(detail?.created_by)
                    ? detail.created_by.map((item: Record<string, unknown>) => item.name).filter(Boolean).join(", ")
                    : "";
                  const providerBackdrop = Array.isArray(info.backdrop_path)
                    ? String(info.backdrop_path[0] ?? "")
                    : String(info.backdrop_path ?? info.backdrop ?? "");

                  enrichedInfo = {
                    ...info,
                    cast: info.cast ?? info.actors ?? cast,
                    castMembers,
                    plot: info.plot ?? info.description ?? detail.overview,
                    genre: info.genre ?? (Array.isArray(detail?.genres)
                      ? detail.genres.map((item: Record<string, unknown>) => item.name).filter(Boolean).join(", ")
                      : ""),
                    releaseDate: info.releaseDate ?? info.release_date ?? detail.first_air_date,
                    backdrop_path: providerBackdrop || backdrop,
                    titleLogo: String(info.title_logo ?? info.logo_path ?? "") || imageUrl(logos[0]?.file_path),
                    trailerKey: String(info.youtube_trailer ?? "") || String(trailer?.key ?? ""),
                    creator: String(info.director ?? info.creator ?? "") || creators,
                    contentRating: String(info.rating_age ?? info.mpaa_rating ?? "") || String(contentRating?.rating ?? ""),
                    language: String(info.language ?? "") || String(detail.original_language ?? "").toUpperCase(),
                    tmdbRating: Number(detail.vote_average) > 0 ? Number(detail.vote_average).toFixed(1) : "",
                    imdbId: String(detail?.external_ids?.imdb_id ?? ""),
                    tmdbId,
                  };
                }
              }
            } catch { /* mantém os metadados originais do provedor */ }
          }

          return json({ info: enrichedInfo, episodes });
        } catch {
          return json({ error: "Não foi possível carregar as séries." }, 502);
        } finally {
          clearTimeout(seriesTimeout);
        }
      }

      /* Catálogo oficial: datas e avaliações reais do provedor. */
      if (action === "home-catalog") {
        const makeApiUrl = (apiAction: string) => {
          const url = new URL(serverUrl.toString());
          const basePath = url.pathname.toLowerCase().endsWith(".php")
            ? url.pathname.slice(0, url.pathname.lastIndexOf("/"))
            : url.pathname.replace(/\/$/, "");
          url.pathname = `${basePath}/player_api.php`;
          url.search = new URLSearchParams({ username, password, action: apiAction }).toString();
          return url;
        };

        const catalogController = new AbortController();
        const catalogTimeout = setTimeout(() => catalogController.abort(), 15000);
        try {
          const [vodResponse, seriesResponse] = await Promise.all([
            fetchProvider(makeApiUrl("get_vod_streams"), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: catalogController.signal }),
            fetchProvider(makeApiUrl("get_series"), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: catalogController.signal }),
          ]);
          if (!vodResponse.ok || !seriesResponse.ok) return json({ error: "Catálogo indisponível." }, 502);
          const vodRaw = await vodResponse.json();
          const seriesRaw = await seriesResponse.json();
          const vod = Array.isArray(vodRaw) ? vodRaw : [];
          const series = Array.isArray(seriesRaw) ? seriesRaw : [];
          const root = new URL(serverUrl.toString());
          const rootPath = root.pathname.toLowerCase().endsWith(".php")
            ? root.pathname.slice(0, root.pathname.lastIndexOf("/"))
            : root.pathname.replace(/\/$/, "");
          const movieUrl = (item: Record<string, unknown>) => {
            const id = String(item.stream_id ?? "");
            const extension = String(item.container_extension ?? "mp4").replace(/[^a-z0-9]/gi, "") || "mp4";
            return `${root.origin}${rootPath}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${id}.${extension}`;
          };
          const rating = (item: Record<string, unknown>) => String(item.rating_5based ?? item.rating ?? "");
          const backdrop = (value: unknown) => {
            if (Array.isArray(value)) return value.find((entry) => typeof entry === "string") ?? "";
            if (typeof value !== "string") return "";
            try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed[0] ?? "" : value; } catch { return value; }
          };
          const movies = vod
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.added ?? 0) - Number(a.added ?? 0))
            .slice(0, 11)
            .map((item: Record<string, unknown>) => ({
              id: `movie:${item.stream_id}`, streamId: String(item.stream_id ?? ""), name: String(item.name ?? "Sem título"),
              url: movieUrl(item), logo: String(item.stream_icon ?? ""), rating: rating(item), added: String(item.added ?? ""),
              contentType: "movie", backdrop: backdrop(item.backdrop_path),
            }));
          const shows = series
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.last_modified ?? b.added ?? 0) - Number(a.last_modified ?? a.added ?? 0))
            .slice(0, 10)
            .map((item: Record<string, unknown>) => ({
              id: `series:${item.series_id}`, streamId: String(item.series_id ?? ""), name: String(item.name ?? "Sem título"),
              url: "", logo: String(item.cover ?? item.stream_icon ?? ""), rating: rating(item),
              added: String(item.last_modified ?? item.added ?? ""), contentType: "series",
              backdrop: backdrop(item.backdrop_path), plot: String(item.plot ?? ""), genre: String(item.genre ?? ""),
            }));
          return json({ movies, series: shows });
        } catch {
          return json({ error: "Não foi possível carregar o catálogo." }, 502);
        } finally {
          clearTimeout(catalogTimeout);
        }
      }

      /* Metadados completos do filme para o hero. */
      if (action === "content-info") {
        if (!streamId) return json({ error: "Conteúdo inválido." }, 400);

        const infoUrl = new URL(serverUrl.toString());
        const basePath = infoUrl.pathname.toLowerCase().endsWith(".php")
          ? infoUrl.pathname.slice(0, infoUrl.pathname.lastIndexOf("/"))
          : infoUrl.pathname.replace(/\/$/, "");
        infoUrl.pathname = `${basePath}/player_api.php`;
        infoUrl.search = new URLSearchParams({
          username,
          password,
          action: "get_vod_info",
          vod_id: streamId,
        }).toString();

        const infoController = new AbortController();
        const infoTimeout = setTimeout(() => infoController.abort(), 12000);
        try {
          const infoResponse = await fetchProvider(infoUrl, {
            headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
            redirect: "follow",
            signal: infoController.signal,
          });
          if (!infoResponse.ok) return json({ error: "Metadados indisponíveis." }, 502);
          const info = await infoResponse.json();

          if (!tmdbReadToken) return json(info);

          const providerInfo = info?.info && typeof info.info === "object" ? info.info : {};
          const movieData = info?.movie_data && typeof info.movie_data === "object" ? info.movie_data : {};
          let tmdbId = String(providerInfo.tmdb_id ?? providerInfo.tmdb ?? movieData.tmdb_id ?? movieData.tmdb ?? "").replace(/\D/g, "");
          const rawMovieName = String(contentName || providerInfo.name || movieData.name || "");
          const movieTitle = rawMovieName
            .replace(/\[[^\]]*\]/g, " ")
            .replace(/\b(?:LEGENDADO|DUBLADO|DUB|LEG|DUAL|NACIONAL|4K|UHD|FHD|HD)\b/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
          const providerYear = contentYear
            || String(providerInfo.release_date ?? providerInfo.releasedate ?? movieData.release_date ?? rawMovieName).match(/(?:19|20)\d{2}/)?.[0]
            || "";
          const normalizeTitle = (value: unknown) => String(value ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();

          const tmdbFetch = async (path: string, params: Record<string, string>) => {
            const url = new URL(`https://api.themoviedb.org/3${path}`);
            url.search = new URLSearchParams(params).toString();
            return fetch(url, {
              headers: { Authorization: `Bearer ${tmdbReadToken}`, Accept: "application/json" },
              signal: infoController.signal,
            });
          };

          if (movieTitle) {
            let searchResponse = await tmdbFetch("/search/movie", {
              query: movieTitle,
              language: "pt-BR",
              include_adult: "false",
              ...(providerYear ? { year: providerYear } : {}),
            });
            let search = searchResponse.ok ? await searchResponse.json() : null;
            if (providerYear && (!Array.isArray(search?.results) || search.results.length === 0)) {
              searchResponse = await tmdbFetch("/search/movie", {
                query: movieTitle,
                language: "pt-BR",
                include_adult: "false",
              });
              search = searchResponse.ok ? await searchResponse.json() : null;
            }
            if (Array.isArray(search?.results)) {
              const normalizedMovieTitle = normalizeTitle(movieTitle);
              const targetTitle = normalizeTitle(movieTitle.replace(/(?:19|20)\d{2}/g, " ")) || normalizedMovieTitle;
              const results = search.results.slice(0, 10);
              const ranked = results.map((item: Record<string, unknown>) => {
                const localized = normalizeTitle(item.title);
                const original = normalizeTitle(item.original_title);
                const candidateYear = String(item.release_date ?? "").match(/(?:19|20)\d{2}/)?.[0] ?? "";
                const titleScore = localized === targetTitle || original === targetTitle
                  ? 8
                  : localized.includes(targetTitle) || targetTitle.includes(localized) || original.includes(targetTitle) || targetTitle.includes(original)
                    ? 4
                    : 0;
                const yearScore = providerYear && candidateYear === providerYear ? 3 : 0;
                return { item, score: titleScore + yearScore };
              }).sort((a: { score: number }, b: { score: number }) => b.score - a.score);
              const best = ranked[0];
              if (best?.item?.id && (!tmdbId || best.score >= 4)) tmdbId = String(best.item.id);
            }
          }

          if (!tmdbId) return json(info);

          const detailResponse = await tmdbFetch(`/movie/${tmdbId}`, {
            language: "pt-BR",
            append_to_response: "images,videos,credits,release_dates",
            include_image_language: "pt,en,null",
            include_video_language: "pt-BR,pt,en-US,en,null",
          });
          if (!detailResponse.ok) return json(info);

          const detail = await detailResponse.json();
          const imageUrl = (path: unknown, size = "original") => typeof path === "string" && path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
          const logos = Array.isArray(detail?.images?.logos) ? detail.images.logos : [];
          const logoRank = (item: Record<string, unknown>) => item.iso_639_1 === "pt" ? 3 : item.iso_639_1 === "en" ? 2 : 1;
          logos.sort((a: Record<string, unknown>, b: Record<string, unknown>) => logoRank(b) - logoRank(a) || Number(b.vote_average ?? 0) - Number(a.vote_average ?? 0));
          const videos = Array.isArray(detail?.videos?.results) ? detail.videos.results : [];
          const trailer = videos
            .filter((item: Record<string, unknown>) => item.site === "YouTube" && (item.type === "Trailer" || item.type === "Teaser"))
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.official === true) - Number(a.official === true) || (b.type === "Trailer" ? 1 : 0) - (a.type === "Trailer" ? 1 : 0))[0];
          const crew = Array.isArray(detail?.credits?.crew) ? detail.credits.crew : [];
          const cast = Array.isArray(detail?.credits?.cast) ? detail.credits.cast : [];
          const castMembers = cast.slice(0, 12).map((item: Record<string, unknown>) => ({
            name: String(item.name ?? ""),
            character: String(item.character ?? ""),
            image: imageUrl(item.profile_path, "w342"),
          })).filter((item: { name: string }) => item.name);
          const directors = crew.filter((item: Record<string, unknown>) => item.job === "Director").map((item: Record<string, unknown>) => item.name).filter(Boolean).slice(0, 3).join(", ");
          const releaseResults = Array.isArray(detail?.release_dates?.results) ? detail.release_dates.results : [];
          const countryRelease = releaseResults.find((item: Record<string, unknown>) => item.iso_3166_1 === "BR")
            ?? releaseResults.find((item: Record<string, unknown>) => item.iso_3166_1 === "US");
          const certifications = countryRelease && Array.isArray((countryRelease as Record<string, unknown>).release_dates)
            ? (countryRelease as Record<string, unknown>).release_dates as Array<Record<string, unknown>>
            : [];
          const contentRating = String(certifications.find((item) => String(item.certification ?? "").trim())?.certification ?? "");

          return json({
            ...info,
            _tmdb: {
              id: tmdbId,
              name: detail.title,
              backdrop: imageUrl(detail.backdrop_path),
              poster: imageUrl(detail.poster_path),
              logo: imageUrl(logos[0]?.file_path),
              trailerKey: trailer?.key ?? "",
              plot: detail.overview,
              releaseDate: detail.release_date,
              duration: Number(detail.runtime) > 0 ? `${Math.floor(Number(detail.runtime) / 60)} h ${Number(detail.runtime) % 60} min` : "",
              genre: Array.isArray(detail.genres) ? detail.genres.map((item: Record<string, unknown>) => item.name).filter(Boolean).join(", ") : "",
              rating: Number(detail.vote_average) > 0 ? Number(detail.vote_average).toFixed(1) : "",
              director: directors,
              cast: castMembers.map((item: { name: string }) => item.name).join(", "),
              castMembers,
              contentRating,
              language: String(detail.original_language ?? "").toUpperCase(),
            },
          });
        } catch {
          return json({ error: "Não foi possível carregar os metadados." }, 502);
        } finally {
          clearTimeout(infoTimeout);
        }
      }

      /*
      |--------------------------------------------------------------------------
      | MONTA get.php
      |--------------------------------------------------------------------------
      */

      const playlistUrl =
        new URL(
          serverUrl.toString(),
        );

      /*
       * Se o DNS for:
       *
       * http://servidor.com
       *
       * vira:
       *
       * http://servidor.com/get.php
       */
      if (
        !playlistUrl.pathname
          .toLowerCase()
          .endsWith(
            "get.php",
          )
      ) {
        playlistUrl.pathname =
          `${playlistUrl.pathname.replace(
            /\/$/,
            "",
          )}/get.php`;
      }

      playlistUrl.search =
        new URLSearchParams(
          {
            username,
            password,

            type:
              "m3u_plus",

            output:
              "ts",
          },
        ).toString();

      console.log(
        "CONNECT LINE:",
        {
          provider:
            providerRow.name,

          dns:
            dns?.name ?? "URL do provedor",

          hostname:
            playlistUrl.hostname,

          pathname:
            playlistUrl.pathname,
        },
      );

      /*
      |--------------------------------------------------------------------------
      | TIMEOUT
      |--------------------------------------------------------------------------
      */

      timeoutId =
        setTimeout(
          () => {
            timedOut =
              true;

            if (
              !controller.signal
                .aborted
            ) {
              controller.abort();
            }
          },
          30000,
        );

      /*
      |--------------------------------------------------------------------------
      | CARREGA PLAYLIST
      |--------------------------------------------------------------------------
      */

      let upstream:
        Response;

      try {
        upstream =
          await fetchProvider(
            playlistUrl,
            {
              method:
                "GET",

              headers: {
                Accept:
                  "application/x-mpegURL, application/vnd.apple.mpegurl, text/plain, */*",

                "User-Agent":
                  "Mozilla/5.0",
              },

              redirect:
                "follow",

              signal:
                controller.signal,
            },
          );
      } catch (
        fetchError
      ) {
        /*
         * Cancelado pelo usuário.
         */
        if (
          req.signal.aborted
        ) {
          console.log(
            "CONNECT LINE CANCELADO",
          );

          return json(
            {
              error:
                "Carregamento cancelado.",
            },
            499,
          );
        }

        /*
         * Timeout.
         */
        if (
          timedOut
        ) {
          return json(
            {
              error:
                "O provedor demorou demais para responder.",
            },
            504,
          );
        }

        const message =
          fetchError instanceof
            Error
            ? fetchError.message
            : String(
                fetchError,
              );

        console.error(
          "CONNECT LINE ERROR:",
          message,
        );

        return json(
          {
            error:
              `Falha ao contatar o DNS ${playlistUrl.hostname}.`,
          },
          502,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | RESPOSTA DO PROVEDOR
      |--------------------------------------------------------------------------
      */

      if (
        !upstream.ok
      ) {
        console.error(
          "CONNECT LINE UPSTREAM:",
          {
            hostname:
              playlistUrl.hostname,

            status:
              upstream.status,
          },
        );

        return json(
          {
            error:
              `Provedor respondeu ${upstream.status}.`,
          },
          502,
        );
      }

      if (
        !upstream.body
      ) {
        return json(
          {
            error:
              "O provedor respondeu sem conteúdo.",
          },
          502,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | STREAM DA PLAYLIST
      |--------------------------------------------------------------------------
      |
      | Não carregamos a lista inteira
      | na memória da Edge Function.
      |
      | O body passa diretamente
      | para o navegador.
      |
      */

      return new Response(
        upstream.body,
        {
          status: 200,

          headers: {
            ...corsHeaders,

            "Content-Type":
              "application/x-mpegURL; charset=utf-8",

            "Cache-Control":
              "no-store",

            "X-Provider-Stream-Base": `${serverUrl.origin}${serverUrl.pathname.toLowerCase().endsWith(".php") ? serverUrl.pathname.slice(0, serverUrl.pathname.lastIndexOf("/")) : serverUrl.pathname.replace(/\/$/, "")}`,
          },
        },
      );
    } catch (error) {
      if (
        req.signal.aborted
      ) {
        return json(
          {
            error:
              "Carregamento cancelado.",
          },
          499,
        );
      }

      const message =
        error instanceof
          Error
          ? error.message
          : String(
              error,
            );

      console.error(
        "CONNECT-LINE ERROR:",
        message,
      );

      return json(
        {
          error:
            `Não foi possível conectar ao provedor: ${message}`,
        },
        502,
      );
    } finally {
      if (
        timeoutId !==
        null
      ) {
        clearTimeout(
          timeoutId,
        );
      }

      req.signal
        .removeEventListener(
          "abort",
          abortFromClient,
        );
    }
  },
);
