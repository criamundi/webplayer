import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Apenas GET e HEAD
  if (
    req.method !== "GET" &&
    req.method !== "HEAD"
  ) {
    return new Response(
      "Método não permitido.",
      {
        status: 405,
        headers: corsHeaders,
      },
    );
  }

  // URL recebida do player
  const requestUrl = new URL(req.url);

  const targetParam =
    requestUrl.searchParams.get("url");

  if (!targetParam) {
    return new Response(
      "URL não informada.",
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  let target: URL;

  try {
    target = new URL(targetParam);
  } catch {
    return new Response(
      "URL inválida.",
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  // Apenas HTTP ou HTTPS
  if (
    target.protocol !== "http:" &&
    target.protocol !== "https:"
  ) {
    return new Response(
      "Protocolo não permitido.",
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  try {
    const upstreamHeaders =
      new Headers();

    const upstreamController =
      new AbortController();

    const abortUpstream = () => {
      if (!upstreamController.signal.aborted) {
        upstreamController.abort();
      }
    };

    if (req.signal.aborted) {
      abortUpstream();
    } else {
      req.signal.addEventListener("abort", abortUpstream, { once: true });
    }

    // Importante para VOD
    const range =
      req.headers.get("range");

    if (range) {
      upstreamHeaders.set(
        "Range",
        range,
      );
    }

    upstreamHeaders.set(
      "User-Agent",
      "Mozilla/5.0",
    );

    console.log(
      "STREAM OPEN:",
      target.protocol,
      target.hostname,
      target.port,
      target.pathname,
    );

    /*
     * IMPORTANTE:
     *
     * Usa exatamente a URL recebida da playlist.
     * Não existe DNS fixo aqui.
     * Não substitui hostname.
     */
    const upstream =
      await fetch(
        target.toString(),
        {
          method: req.method,
          headers: upstreamHeaders,
          redirect: "follow",

          /*
           * Se a requisição for cancelada,
           * tenta cancelar o upstream também.
           */
          signal: upstreamController.signal,
        },
      );

    console.log(
      "STREAM STATUS:",
      upstream.status,
      target.hostname,
    );

    const responseHeaders =
      new Headers();

    responseHeaders.set(
      "Access-Control-Allow-Origin",
      "*",
    );

    responseHeaders.set(
      "Access-Control-Allow-Methods",
      "GET, HEAD, OPTIONS",
    );

    responseHeaders.set(
      "Access-Control-Allow-Headers",
      "Range, Content-Type",
    );

    responseHeaders.set(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges, Content-Type",
    );

    responseHeaders.set(
      "Cache-Control",
      "no-store",
    );

    /*
     * Copia apenas headers necessários.
     */
    const contentType =
      upstream.headers.get(
        "content-type",
      );

    if (contentType) {
      responseHeaders.set(
        "Content-Type",
        contentType,
      );
    }

    const contentLength =
      upstream.headers.get(
        "content-length",
      );

    if (contentLength) {
      responseHeaders.set(
        "Content-Length",
        contentLength,
      );
    }

    const contentRange =
      upstream.headers.get(
        "content-range",
      );

    if (contentRange) {
      responseHeaders.set(
        "Content-Range",
        contentRange,
      );
    }

    const acceptRanges =
      upstream.headers.get(
        "accept-ranges",
      );

    if (acceptRanges) {
      responseHeaders.set(
        "Accept-Ranges",
        acceptRanges,
      );
    }

    /*
     * HEAD não retorna body.
     */
    if (req.method === "HEAD") {
      abortUpstream();

      return new Response(
        null,
        {
          status: upstream.status,
          headers: responseHeaders,
        },
      );
    }

    /*
     * Streaming direto.
     *
     * Não converte para Blob,
     * arrayBuffer ou texto.
     */
    if (!upstream.body) {
      abortUpstream();

      return new Response(null, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    /*
     * Ponte explícita: quando o player cancela a resposta, o reader
     * e o fetch upstream também são encerrados imediatamente.
     */
    const reader = upstream.body.getReader();

    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();

          if (done) {
            req.signal.removeEventListener("abort", abortUpstream);
            controller.close();
            return;
          }

          controller.enqueue(value);
        } catch (error) {
          if (upstreamController.signal.aborted) {
            controller.close();
            return;
          }

          controller.error(error);
        }
      },

      async cancel(reason) {
        abortUpstream();
        req.signal.removeEventListener("abort", abortUpstream);

        try {
          await reader.cancel(reason);
        } catch {
          // O upstream pode já ter sido encerrado.
        }
      },
    });

    return new Response(
      body,
      {
        status: upstream.status,
        headers: responseHeaders,
      },
    );
  } catch (error) {
    /*
     * Se o navegador cancelou o canal,
     * isso não é um problema real.
     */
    if (req.signal.aborted) {
      console.log(
        "STREAM CANCELADO:",
        target.hostname,
      );

      return new Response(
        "Stream cancelado.",
        {
          status: 408,
          headers: corsHeaders,
        },
      );
    }

    console.error(
      "STREAM ERROR:",
      target.hostname,
      error,
    );

    return new Response(
      "Falha ao conectar ao stream.",
      {
        status: 502,
        headers: corsHeaders,
      },
    );
  }
});
