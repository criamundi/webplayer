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
          1
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
            "id, name, active",
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

      const {
        data: line,
        error:
          lineError,
      } =
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
            max_connections,
            expires_at,
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
            "password",
            password,
          )
          .eq(
            "provider_id",
            providerRow.id,
          )
          .maybeSingle();

      if (
        lineError ||
        !line
      ) {
        return json(
          {
            error:
              "Credenciais não encontradas. Verifique usuário e senha.",
          },
          401,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | STATUS
      |--------------------------------------------------------------------------
      */

      if (
        line.status !==
        "active"
      ) {
        return json(
          {
            error:
              "Seu acesso está desativado. Entre em contato com o suporte.",
          },
          403,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | VENCIMENTO
      |--------------------------------------------------------------------------
      */

      if (
        line.expires_at &&
        new Date(
          line.expires_at,
        ) <= new Date()
      ) {
        return json(
          {
            error:
              "Seu acesso expirou. Renove com o suporte para continuar.",
          },
          403,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | DNS DEFINIDO NO ADMIN
      |--------------------------------------------------------------------------
      |
      | IMPORTANTE:
      |
      | Não existe fallback para
      | provider.server_url.
      |
      | A linha usa exclusivamente
      | o DNS que foi vinculado no Admin.
      |
      */

      const dns =
        line.iptv_dns as {
          id: string;
          name: string;
          host: string;
          active: boolean;
        } | null;

      if (!dns) {
        return json(
          {
            error:
              "Nenhum DNS está vinculado a esta linha.",
          },
          502,
        );
      }

      if (!dns.active) {
        return json(
          {
            error:
              "O DNS vinculado a esta linha está desativado.",
          },
          502,
        );
      }

      if (!dns.host) {
        return json(
          {
            error:
              "O DNS vinculado não possui um endereço configurado.",
          },
          502,
        );
      }

      const serverUrl =
        validServerUrl(
          dns.host,
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
            dns.name,

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