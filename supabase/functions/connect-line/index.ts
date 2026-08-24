import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createClient,
} from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",

  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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

function upstreamState(raw: Record<string, unknown>) {
  const user = raw?.user_info && typeof raw.user_info === "object"
    ? raw.user_info as Record<string, unknown>
    : {};
  const authenticated = String(user.auth ?? "0") === "1";
  const status = String(user.status ?? "").trim();
  const expSeconds = Number(user.exp_date ?? 0);
  const expiresAt = Number.isFinite(expSeconds) && expSeconds > 0
    ? new Date(expSeconds * 1000).toISOString()
    : null;
  return {
    authenticated,
    status,
    expiresAt,
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
        body.action === "content-info" || body.action === "home-catalog" || body.action === "account-status"
          ? body.action
          : "playlist";

      const streamId =
        typeof body.streamId === "string" && /^\d+$/.test(body.streamId)
          ? body.streamId
          : "";

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

      /* A conta real do provedor é sempre a fonte de status e vencimento. */
      let upstreamResponse: Response;
      let upstreamPayload: Record<string, unknown>;
      try {
        upstreamResponse = await fetch(playerApiUrl(serverUrl, username, password), {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
          redirect: "follow",
          signal: controller.signal,
        });
        if (!upstreamResponse.ok) throw new Error("provider status");
        upstreamPayload = await upstreamResponse.json();
      } catch {
        return json({ error: "Não foi possível validar a conta no provedor agora." }, 502);
      }

      const account = upstreamState(upstreamPayload);
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
        return json({ expiresAt: account.expiresAt, daysRemaining, status: account.status, renewalUrl: providerRow.renewal_url ?? null });
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
            fetch(makeApiUrl("get_vod_streams"), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: catalogController.signal }),
            fetch(makeApiUrl("get_series"), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: catalogController.signal }),
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
          const infoResponse = await fetch(infoUrl, {
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
          const providerName = String(providerInfo.name ?? movieData.name ?? "").replace(/\s*\[(?:E|LEG|DUB)\].*$/i, "").trim();
          const providerYear = String(providerInfo.release_date ?? providerInfo.releasedate ?? "").match(/(?:19|20)\d{2}/)?.[0] ?? "";

          const tmdbFetch = async (path: string, params: Record<string, string>) => {
            const url = new URL(`https://api.themoviedb.org/3${path}`);
            url.search = new URLSearchParams(params).toString();
            return fetch(url, {
              headers: { Authorization: `Bearer ${tmdbReadToken}`, Accept: "application/json" },
              signal: infoController.signal,
            });
          };

          if (!tmdbId && providerName) {
            const searchResponse = await tmdbFetch("/search/movie", {
              query: providerName,
              language: "pt-BR",
              include_adult: "false",
              ...(providerYear ? { year: providerYear } : {}),
            });
            if (searchResponse.ok) {
              const search = await searchResponse.json();
              tmdbId = String(search?.results?.[0]?.id ?? "");
            }
          }

          if (!tmdbId) return json(info);

          const detailResponse = await tmdbFetch(`/movie/${tmdbId}`, {
            language: "pt-BR",
            append_to_response: "images,videos,credits",
            include_image_language: "pt,en,null",
            include_video_language: "pt-BR,pt,en-US,en,null",
          });
          if (!detailResponse.ok) return json(info);

          const detail = await detailResponse.json();
          const imageUrl = (path: unknown) => typeof path === "string" && path ? `https://image.tmdb.org/t/p/original${path}` : "";
          const logos = Array.isArray(detail?.images?.logos) ? detail.images.logos : [];
          const logoRank = (item: Record<string, unknown>) => item.iso_639_1 === "pt" ? 3 : item.iso_639_1 === "en" ? 2 : 1;
          logos.sort((a: Record<string, unknown>, b: Record<string, unknown>) => logoRank(b) - logoRank(a) || Number(b.vote_average ?? 0) - Number(a.vote_average ?? 0));
          const videos = Array.isArray(detail?.videos?.results) ? detail.videos.results : [];
          const trailer = videos
            .filter((item: Record<string, unknown>) => item.site === "YouTube" && (item.type === "Trailer" || item.type === "Teaser"))
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.official === true) - Number(a.official === true) || (b.type === "Trailer" ? 1 : 0) - (a.type === "Trailer" ? 1 : 0))[0];
          const crew = Array.isArray(detail?.credits?.crew) ? detail.credits.crew : [];
          const cast = Array.isArray(detail?.credits?.cast) ? detail.credits.cast : [];
          const directors = crew.filter((item: Record<string, unknown>) => item.job === "Director").map((item: Record<string, unknown>) => item.name).filter(Boolean).slice(0, 3).join(", ");

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
              cast: cast.map((item: Record<string, unknown>) => item.name).filter(Boolean).slice(0, 6).join(", "),
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
          await fetch(
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
