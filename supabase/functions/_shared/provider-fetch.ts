const vpsProxyUrl = Deno.env.get("VPS_STREAM_PROXY_URL")?.trim() ?? "";
const vpsProxyToken = Deno.env.get("VPS_STREAM_PROXY_TOKEN")?.trim() ?? "";

export async function fetchProvider(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const target = input instanceof URL ? input : new URL(input);

  if (!vpsProxyUrl || !vpsProxyToken) {
    return fetch(target, init);
  }

  const proxy = new URL(vpsProxyUrl);
  if (proxy.protocol !== "https:") {
    throw new Error("VPS_STREAM_PROXY_URL precisa usar HTTPS.");
  }

  proxy.searchParams.set("url", target.toString());
  proxy.searchParams.set("raw", "1");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${vpsProxyToken}`);

  return fetch(proxy, {
    ...init,
    method: init.method ?? "GET",
    headers,
    redirect: "follow",
  });
}
