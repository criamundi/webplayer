import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    const providerName = clean(body?.provider, 120);
    const username = clean(body?.username, 120);
    const password = clean(body?.password, 200);
    const deviceKey = clean(body?.device?.deviceKey, 300);

    if (!providerName || !username || !password || !deviceKey) {
      return json({ error: "missing_fields" }, 400);
    }

    const { data: providers, error: providerError } = await adminClient
      .from("iptv_providers")
      .select("id, name")
      .ilike("name", providerName)
      .limit(2);

    if (providerError) throw providerError;
    const provider = providers?.find((item) => item.name.toLocaleLowerCase() === providerName.toLocaleLowerCase()) ?? providers?.[0];
    if (!provider) return json({ error: "provider_not_found" }, 404);

    const { data: line, error: lineError } = await adminClient
      .from("iptv_lines")
      .select("id, provider_id, local_enabled, status")
      .eq("provider_id", provider.id)
      .eq("username", username)
      .eq("password", password)
      .maybeSingle();

    if (lineError) throw lineError;
    if (!line || line.local_enabled === false || line.status === "banned" || line.status === "disabled") {
      return json({ error: "line_not_allowed" }, 403);
    }

    const payload = {
      line_id: line.id,
      provider_id: provider.id,
      name: clean(body?.device?.name, 160) || "Smart TV",
      device_key: deviceKey,
      platform: clean(body?.device?.platform, 40) || "tv",
      model: clean(body?.device?.model, 120) || null,
      model_code: clean(body?.device?.modelCode, 120) || null,
      firmware: clean(body?.device?.firmware, 120) || null,
      app_version: clean(body?.device?.appVersion, 40) || null,
      status: "active",
      last_seen_at: new Date().toISOString(),
    };

    const { data: device, error: upsertError } = await adminClient
      .from("iptv_devices")
      .upsert(payload, { onConflict: "device_key" })
      .select("id, device_key, line_id, last_seen_at")
      .single();

    if (upsertError) throw upsertError;
    return json({ ok: true, device });
  } catch (error) {
    console.error("register-tv-device:", error);
    return json({ error: error instanceof Error ? error.message : "internal_error" }, 500);
  }
});
