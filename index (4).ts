import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const blockedHostnames = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "metadata.google.com",
]);

function isPublicUrl(value: string): URL | null {
  try {
    const target = new URL(value);
    const hostname = target.hostname.toLowerCase();
    const isPrivateIp =
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("172.16.") ||
      hostname.startsWith("172.17.") ||
      hostname.startsWith("172.18.") ||
      hostname.startsWith("172.19.") ||
      hostname.startsWith("172.2") ||
      hostname.startsWith("172.30.") ||
      hostname.startsWith("172.31.") ||
      hostname.startsWith("169.254.") ||
      hostname.endsWith(".local");

    if (!['http:', 'https:'].includes(target.protocol) || blockedHostnames.has(hostname) || isPrivateIp) {
      return null;
    }

    return target;
  } catch {
    return null;
  }
}

function response(body: BodyInit, status = 200, contentType = "text/plain; charset=utf-8") {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": contentType },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const input = new URL(req.url).searchParams.get("url");
    const target = input ? isPublicUrl(input) : null;

    if (!target) return response("Não foi possível acessar essa lista.", 400);

    let currentUrl = target;
    let upstream: Response | null = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      upstream = await fetch(currentUrl, {
        headers: { Accept: "application/x-mpegURL, application/vnd.apple.mpegurl, text/plain, */*" },
        redirect: "manual",
      });

      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
      const location = upstream.headers.get("location");
      const redirected = location ? isPublicUrl(new URL(location, currentUrl).toString()) : null;
      if (!redirected) return response("Não foi possível acessar essa lista.", 400);
      currentUrl = redirected;
    }

    if (!upstream || !upstream.ok) return response("Não foi possível carregar essa lista.", 502);

    const body = await upstream.text();
    if (body.length > 15_000_000) return response("Essa lista é grande demais para carregar.", 413);
    return response(body);
  } catch {
    return response("Não foi possível carregar essa lista.", 502);
  }
});
