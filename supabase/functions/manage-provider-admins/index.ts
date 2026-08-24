import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return response({ error: "Método não permitido." }, 405);
  try {
    const bearer = req.headers.get("Authorization") ?? "";
    const token = bearer.replace(/^Bearer\s+/i, "");
    if (!token) return response({ error: "Faça login novamente." }, 401);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return response({ error: "Sessão inválida." }, 401);
    const { data: requester } = await admin.from("profiles").select("role, admin_active").eq("id", userData.user.id).maybeSingle();
    if (requester?.role !== "super_admin" || requester.admin_active === false) return response({ error: "Somente o Super Admin pode realizar esta operação." }, 403);

    const body = await req.json();
    const action = String(body.action ?? "");
    const targetId = String(body.id ?? "");
    const targetProfile = async () => {
      if (!targetId) return null;
      const { data } = await admin.from("profiles").select("id, role, admin_active").eq("id", targetId).maybeSingle();
      return data?.role === "provider_admin" ? data : null;
    };

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const displayName = String(body.displayName ?? "").trim();
      const providerId = String(body.providerId ?? "");
      if (!/^\S+@\S+\.\S+$/.test(email)) return response({ error: "Informe um e-mail válido." }, 400);
      if (password.length < 8) return response({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      const { data: provider } = await admin.from("iptv_providers").select("id").eq("id", providerId).maybeSingle();
      if (!provider) return response({ error: "Selecione um provedor válido." }, 400);
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name: displayName },
      });
      if (createError || !created.user) {
        const duplicated = createError?.message?.toLowerCase().includes("already") || createError?.message?.toLowerCase().includes("registered");
        return response({ error: duplicated ? "Já existe um usuário com esse e-mail." : "Não foi possível criar o administrador." }, 400);
      }
      const { error: profileError } = await admin.from("profiles").update({
        role: "provider_admin", provider_id: providerId, display_name: displayName || null, admin_active: true,
      }).eq("id", created.user.id);
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return response({ error: "Não foi possível vincular o administrador ao provedor." }, 500);
      }
      return response({ ok: true, id: created.user.id });
    }

    const profile = await targetProfile();
    if (!profile) return response({ error: "Administrador não encontrado." }, 404);

    if (action === "reset-password") {
      const password = String(body.password ?? "");
      if (password.length < 8) return response({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      const { error } = await admin.auth.admin.updateUserById(targetId, { password });
      return error ? response({ error: "Não foi possível trocar a senha." }, 400) : response({ ok: true });
    }
    if (action === "toggle") {
      const active = !profile.admin_active;
      const { error: authError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: active ? "none" : "876000h" });
      if (authError) return response({ error: "Não foi possível alterar o acesso." }, 400);
      await admin.from("profiles").update({ admin_active: active }).eq("id", targetId);
      return response({ ok: true, active });
    }
    if (action === "update") {
      const providerId = String(body.providerId ?? "");
      const displayName = String(body.displayName ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return response({ error: "Informe um e-mail válido." }, 400);
      const { data: provider } = await admin.from("iptv_providers").select("id").eq("id", providerId).maybeSingle();
      if (!provider) return response({ error: "Provedor inválido." }, 400);
      const { error: authError } = await admin.auth.admin.updateUserById(targetId, { email, email_confirm: true, user_metadata: { display_name: displayName } });
      if (authError) return response({ error: authError.message.toLowerCase().includes("already") ? "Este e-mail já está em uso." : "Não foi possível alterar o e-mail." }, 400);
      const { error } = await admin.from("profiles").update({ email, provider_id: providerId, display_name: displayName || null }).eq("id", targetId);
      return error ? response({ error: "O login foi alterado, mas não foi possível atualizar o perfil." }, 500) : response({ ok: true });
    }
    if (action === "delete") {
      const { error } = await admin.auth.admin.deleteUser(targetId);
      return error ? response({ error: "Não foi possível excluir o administrador." }, 400) : response({ ok: true });
    }
    return response({ error: "Operação inválida." }, 400);
  } catch (error) {
    console.error("manage-provider-admins", error);
    return response({ error: "Erro interno ao gerenciar administrador." }, 500);
  }
});
