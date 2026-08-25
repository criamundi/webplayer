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
    upstreamHeaders.set("Accept", "*/*");

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
          signal: req.signal,
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
    } else if (/\.m3u8(?:$|\?)/i.test(target.toString())) {
      responseHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
    } else if (/\.ts(?:$|\?)/i.test(target.toString())) {
      responseHeaders.set("Content-Type", "video/mp2t");
    } else if (/\.mp4(?:$|\?)/i.test(target.toString())) {
      responseHeaders.set("Content-Type", "video/mp4");
    }

    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("X-Accel-Buffering", "no");

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
      return new Response(
        null,
        {
          status: upstream.status,
          headers: responseHeaders,
        },
      );
    }

    /*
     * Uma playlist HLS contém URLs internas para variantes, chaves e
     * segmentos. Se elas forem devolvidas sem alteração, o navegador tenta
     * acessar o servidor IPTV diretamente e a reprodução falha por
     * mixed-content/CORS. Mantemos todas essas requisições dentro do proxy.
     */
    const isHlsManifest =
      /(?:application|audio)\/(?:vnd\.apple\.mpegurl|x-mpegurl)/i.test(contentType || "") ||
      /\.m3u8(?:$|\?)/i.test(target.toString());

    if (isHlsManifest) {
      const manifest = await upstream.text();
      const proxyBase = `${requestUrl.origin}${requestUrl.pathname}`;
      const proxyUrl = (value: string) => {
        try {
          return `${proxyBase}?url=${encodeURIComponent(new URL(value, target).toString())}`;
        } catch {
          return value;
        }
      };
      const rewritten = manifest
        .split(/\r?\n/)
        .map((line) => {
          if (!line) return line;
          if (!line.startsWith("#")) return proxyUrl(line.trim());
          return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${proxyUrl(uri)}"`);
        })
        .join("\n");

      responseHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
      responseHeaders.delete("Content-Length");
      return new Response(rewritten, { status: upstream.status, headers: responseHeaders });
    }

    /*
     * Streaming direto.
     *
     * Não converte para Blob,
     * arrayBuffer ou texto.
     */
    return new Response(
      upstream.body,
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
