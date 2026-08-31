import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { fetchProvider } from "../_shared/provider-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function validServerUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const privateHost = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local") || host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("172.16.") || host.startsWith("172.17.") || host.startsWith("172.18.") || host.startsWith("172.19.") || host.startsWith("172.2") || host.startsWith("172.30.") || host.startsWith("172.31.") || host.startsWith("169.254.");
    if (!['http:', 'https:'].includes(url.protocol) || privateHost) return null;
    return url;
  } catch {
    return null;
  }
}

async function readLimited(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authorization = req.headers.get("Authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Acesso não autorizado." }, 401);

    const { data: userData } = await adminClient.auth.getUser(token);
    if (!userData.user) return json({ error: "Acesso não autorizado." }, 401);

    const body = await req.json();
    const providerId = typeof body.providerId === "string" ? body.providerId : "";
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!providerId || username.length < 1 || username.length > 120 || password.length < 1 || password.length > 200) {
      return json({ error: "Dados de acesso inválidos." }, 400);
    }

    const { data: provider } = await adminClient
      .from("iptv_providers")
      .select("server_url, active")
      .eq("id", providerId)
      .eq("active", true)
      .maybeSingle();

    const serverUrl = provider?.server_url ? validServerUrl(provider.server_url) : null;
    if (!provider || !serverUrl) return json({ error: "Provedor indisponível." }, 404);

    const playlistUrl = new URL(serverUrl.toString());
    if (!playlistUrl.pathname.toLowerCase().endsWith("get.php")) {
      playlistUrl.pathname = `${playlistUrl.pathname.replace(/\/$/, "")}/get.php`;
    }
    playlistUrl.search = new URLSearchParams({ username, password, type: "m3u_plus", output: "ts" }).toString();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const upstream = await fetchProvider(playlistUrl, {
      headers: { Accept: "application/x-mpegURL, application/vnd.apple.mpegurl, text/plain, */*" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!upstream.ok) return json({ error: "Não foi possível autenticar no provedor." }, 502);
    const content = await readLimited(upstream, 8_000_000);
    if (!content) return json({ error: "A lista do provedor é grande demais." }, 413);
    if (!content.includes("#EXTM3U") && !content.includes("#EXTINF")) return json({ error: "O provedor não retornou uma lista válida." }, 502);

    return text(content);
  } catch {
    return json({ error: "Não foi possível conectar ao provedor." }, 502);
  }
});
