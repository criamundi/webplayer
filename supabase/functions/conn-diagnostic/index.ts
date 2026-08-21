import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

interface LineInfo {
  username: string;
  password: string;
  host: string;
  max_connections: number;
}

async function loadLine(lineId: string): Promise<LineInfo | null> {
  const { data: line, error } = await adminClient
    .from("iptv_lines")
    .select("username, password, max_connections, status, iptv_providers(server_url, active), iptv_dns(host, active)")
    .eq("id", lineId)
    .maybeSingle();

  if (error || !line) return null;
  if (line.status !== "active") return null;

  const provider = line.iptv_providers as { server_url: string | null; active: boolean } | null;
  const dns = line.iptv_dns as { host: string; active: boolean } | null;
  const hostSource = dns && dns.active ? dns.host : provider?.server_url;
  if (!hostSource) return null;

  const serverUrl = validServerUrl(hostSource);
  if (!serverUrl) return null;

  return {
    username: line.username,
    password: line.password,
    host: serverUrl.origin,
    max_connections: line.max_connections,
  };
}

interface ApiInfo {
  auth: number | null;
  status: string | null;
  active_cons: number | null;
  max_connections: number | null;
  exp_date: string | null;
  is_trial: string | null;
  server_info: Record<string, unknown> | null;
  raw_user_info: Record<string, unknown> | null;
  raw_server_info: Record<string, unknown> | null;
}

async function queryPlayerApi(line: LineInfo): Promise<{ result: ApiInfo; httpStatus: number; ok: boolean; error?: string }> {
  const apiUrl = new URL(`${line.host}/player_api.php`);
  apiUrl.searchParams.set("username", line.username);
  apiUrl.searchParams.set("password", line.password);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(apiUrl, {
      headers: { Accept: "application/json, */*", "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!resp.ok) {
      return {
        result: {
          auth: null, status: null, active_cons: null, max_connections: null,
          exp_date: null, is_trial: null, server_info: null,
          raw_user_info: null, raw_server_info: null,
        },
        httpStatus: resp.status,
        ok: false,
        error: `HTTP ${resp.status}`,
      };
    }

    const text = await resp.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        result: {
          auth: null, status: null, active_cons: null, max_connections: null,
          exp_date: null, is_trial: null, server_info: null,
          raw_user_info: null, raw_server_info: null,
        },
        httpStatus: resp.status,
        ok: false,
        error: "Resposta não é JSON válido",
      };
    }

    const userInfo = (parsed["user_info"] ?? {}) as Record<string, unknown>;
    const serverInfo = (parsed["server_info"] ?? null) as Record<string, unknown> | null;

    const expTimestamp = userInfo["exp_date"];
    let expDate: string | null = null;
    if (typeof expTimestamp === "string" || typeof expTimestamp === "number") {
      const ts = Number(expTimestamp);
      if (!isNaN(ts) && ts > 0) {
        expDate = new Date(ts * 1000).toISOString();
      }
    }

    return {
      result: {
        auth: typeof userInfo["auth"] === "number" ? userInfo["auth"] as number : null,
        status: typeof userInfo["status"] === "string" ? userInfo["status"] as string : (typeof userInfo["status"] === "number" ? String(userInfo["status"]) : null),
        active_cons: typeof userInfo["active_cons"] === "number" ? userInfo["active_cons"] as number : null,
        max_connections: typeof userInfo["max_connections"] === "number" ? userInfo["max_connections"] as number : null,
        exp_date: expDate,
        is_trial: typeof userInfo["is_trial"] === "string" ? userInfo["is_trial"] as string : (typeof userInfo["is_trial"] === "number" ? String(userInfo["is_trial"]) : null),
        server_info: serverInfo,
        raw_user_info: userInfo,
        raw_server_info: serverInfo,
      },
      httpStatus: resp.status,
      ok: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      result: {
        auth: null, status: null, active_cons: null, max_connections: null,
        exp_date: null, is_trial: null, server_info: null,
        raw_user_info: null, raw_server_info: null,
      },
      httpStatus: 0,
      ok: false,
      error: msg,
    };
  }
}

async function tryStream(line: LineInfo, streamUrl?: string): Promise<{ httpStatus: number; ok: boolean; error?: string; url: string; contentLength: string | null; contentType: string | null }> {
  let target: string;
  if (streamUrl) {
    target = streamUrl;
  } else {
    target = `${line.host}/live/${line.username}/${line.password}/1.ts`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const resp = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "*/*",
        "User-Agent": "Mozilla/5.0",
        Range: "bytes=0-1023",
      },
      signal: controller.signal,
      redirect: "follow",
    }).finally(() => clearTimeout(timeout));

    // Read a small chunk to verify real content, then cancel
    let hasBody = false;
    if (resp.body) {
      const reader = resp.body.getReader();
      try {
        const { done, value } = await reader.read();
        if (!done && value && value.byteLength > 0) hasBody = true;
      } finally {
        await reader.cancel();
      }
    }

    const contentLength = resp.headers.get("content-length");
    const contentType = resp.headers.get("content-type");

    // Cloudflare can return 200 with Content-Length: 0 on HEAD — treat as not-ok
    const realOk = resp.ok && (hasBody || (contentLength !== "0" && contentLength !== null));

    return { httpStatus: resp.status, ok: realOk, url: target, contentLength, contentType };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { httpStatus: 0, ok: false, error: msg, url: target, contentLength: null, contentType: null };
  }
}

function summarize(stage: string, api: { result: ApiInfo; httpStatus: number; ok: boolean; error?: string }, stream?: { httpStatus: number; ok: boolean; error?: string; url: string }) {
  const r = api.result;
  return {
    stage,
    api: {
      http_status: api.httpStatus,
      ok: api.ok,
      error: api.error ?? null,
      auth: r.auth,
      status: r.status,
      active_cons: r.active_cons,
      max_connections: r.max_connections,
      exp_date: r.exp_date,
      is_trial: r.is_trial,
      server_info: r.server_info,
    },
    stream: stream ? {
      http_status: stream.httpStatus,
      ok: stream.ok,
      error: stream.error ?? null,
      content_length: stream.contentLength,
      content_type: stream.contentType,
    } : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const lineId = typeof body.lineId === "string" ? body.lineId.trim() : "";
    if (!lineId) return json({ error: "lineId é obrigatório." }, 400);

    const line = await loadLine(lineId);
    if (!line) return json({ error: "Linha não encontrada, inativa ou sem servidor configurado." }, 404);

    const results: unknown[] = [];

    // Stage 1: before playing any channel
    const s1Api = await queryPlayerApi(line);
    results.push(summarize("1_antes_reproduzir", s1Api));

    // Stage 2: with a channel playing (simulate by requesting a stream)
    const s2Stream = await tryStream(line);
    const s2Api = await queryPlayerApi(line);
    results.push(summarize("2_canal_reproduzindo", s2Api, s2Stream));

    // Stage 3: after switching channels 3 times
    const switchResults: Array<{ httpStatus: number; ok: boolean; error?: string; url: string }> = [];
    for (let i = 0; i < 3; i++) {
      const sw = await tryStream(line, `${line.host}/live/${line.username}/${line.password}/${i + 2}.ts`);
      switchResults.push(sw);
    }
    const s3Api = await queryPlayerApi(line);
    results.push({
      ...summarize("3_apos_trocar_3x", s3Api),
      stream_switches: switchResults.map((s) => ({ http_status: s.httpStatus, ok: s.ok, error: s.error ?? null, content_length: s.contentLength, content_type: s.contentType })),
    });

    // Stage 4: 30 seconds after stopping playback
    await new Promise((resolve) => setTimeout(resolve, 30000));
    const s4Api = await queryPlayerApi(line);
    results.push(summarize("4_30s_apos_parar", s4Api));

    // Analysis
    const cons = results.map((r) => {
      const item = r as { api?: { active_cons?: number | null } };
      return item.api?.active_cons ?? null;
    });

    const maxCons = s1Api.result.max_connections ?? line.max_connections;
    const cons1 = cons[0];
    const cons2 = cons[1];
    const cons3 = cons[2];
    const cons4 = cons[3];

    const increasing = cons1 !== null && cons2 !== null && cons3 !== null && cons2 > cons1 && cons3 > cons2;
    const notDecreasing = cons3 !== null && cons4 !== null && cons4 >= cons3;
    const atMax = cons.some((c) => c !== null && c >= maxCons);

    const analysis = {
      active_cons_progression: cons,
      max_connections: maxCons,
      connections_increasing_on_switch: increasing,
      connections_not_decreasing_after_stop: notDecreasing,
      reached_max_connections: atMax,
      verdict: increasing && notDecreasing
        ? "PROVEDOR ESTÁ ACUMULANDO CONEXÕES: active_cons sobe a cada troca e não baixa após parar. Isso indica que o provedor não está liberando conexões antigas, o que pode bloquear a linha ao atingir max_connections."
        : increasing
        ? "PROVEDOR ESTÁ ACUMULANDO CONEXÕES DURANTE TROCAS, mas houve queda após parar. Pode haver um atraso na liberação."
        : notDecreasing
        ? "active_cons não baixou após parar, mas também não subiu de forma consistente nas trocas. Monitorar."
        : "Comportamento normal: active_cons estável ou caindo após parar a reprodução.",
    };

    return json({ line_id: lineId, stages: results, analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Falha no diagnóstico: ${msg}` }, 500);
  }
});
