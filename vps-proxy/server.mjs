import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import crypto from 'node:crypto';
import { lookup } from 'node:dns/promises';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const PROXY_TOKEN = process.env.PROXY_TOKEN || '';
const CONNECT_TIMEOUT_MS = Number(process.env.CONNECT_TIMEOUT_MS || 20000);
const MAX_MANIFEST_BYTES = Number(process.env.MAX_MANIFEST_BYTES || 5 * 1024 * 1024);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

if (!PROXY_TOKEN || PROXY_TOKEN.length < 32) {
  throw new Error('PROXY_TOKEN precisa ter pelo menos 32 caracteres.');
}

function safeTokenEquals(received) {
  const expectedBuffer = Buffer.from(PROXY_TOKEN);
  const receivedBuffer = Buffer.from(received || '');
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigins.has('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges, Content-Type, X-Upstream-Status',
  );
}

function originAllowed(req) {
  const origin = req.headers.origin;
  return allowedOrigins.has('*') || !origin || allowedOrigins.has(origin);
}

function isPrivateIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) return isPrivateIPv4(address);
  if (!net.isIPv6(address)) return true;
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  if (normalized.startsWith('::ffff:')) return isPrivateIPv4(normalized.slice(7));
  return false;
}

async function resolvePublicAddress(hostname) {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) {
    throw new Error('Destino local bloqueado.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Endereço privado bloqueado.');
    return { address: hostname, family: net.isIPv6(hostname) ? 6 : 4 };
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Destino privado ou sem DNS público.');
  }
  return addresses[0];
}

function requestOnce(target, method, requestHeaders, signal) {
  return new Promise(async (resolve, reject) => {
    let resolved;
    try {
      resolved = await resolvePublicAddress(target.hostname);
    } catch (error) {
      reject(error);
      return;
    }

    const transport = target.protocol === 'https:' ? https : http;
    const upstreamRequest = transport.request(
      target,
      {
        method,
        headers: requestHeaders,
        lookup: (_hostname, options, callback) => {
          if (options?.all) callback(null, [resolved]);
          else callback(null, resolved.address, resolved.family);
        },
      },
      (response) => {
        upstreamRequest.setTimeout(0);
        resolve(response);
      },
    );

    const abort = () => upstreamRequest.destroy(new Error('Requisição cancelada.'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });

    upstreamRequest.setTimeout(CONNECT_TIMEOUT_MS, () => {
      upstreamRequest.destroy(new Error('Tempo de conexão esgotado.'));
    });
    upstreamRequest.on('error', reject);
    upstreamRequest.end();
  });
}

async function openUpstream(initialTarget, method, headers, signal) {
  let target = initialTarget;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await requestOnce(target, method, headers, signal);
    const location = response.headers.location;
    if (location && response.statusCode >= 300 && response.statusCode < 400) {
      response.resume();
      target = new URL(location, target);
      if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Redirecionamento inválido.');
      continue;
    }
    return { response, target };
  }
  throw new Error('Muitos redirecionamentos.');
}

function copyResponseHeaders(upstream, res, target) {
  const contentType = upstream.headers['content-type'];
  const fallbackType = /\.m3u8(?:$|\?)/i.test(target.href)
    ? 'application/vnd.apple.mpegurl'
    : /\.ts(?:$|\?)/i.test(target.href)
      ? 'video/mp2t'
      : /\.mp4(?:$|\?)/i.test(target.href)
        ? 'video/mp4'
        : undefined;

  if (contentType || fallbackType) res.setHeader('Content-Type', contentType || fallbackType);
  for (const header of ['content-length', 'content-range', 'accept-ranges']) {
    if (upstream.headers[header]) res.setHeader(header, upstream.headers[header]);
  }
  res.setHeader('X-Upstream-Status', String(upstream.statusCode || 502));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-store');
}

function readLimitedText(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    stream.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_MANIFEST_BYTES) {
        stream.destroy(new Error('Manifesto HLS excedeu o limite.'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200).end(JSON.stringify({ ok: true, service: 'nexus-stream-proxy' }));
    return;
  }

  if (requestUrl.pathname !== '/stream' || !['GET', 'HEAD'].includes(req.method || '')) {
    res.writeHead(404).end('Não encontrado.');
    return;
  }
  if (!originAllowed(req)) {
    res.writeHead(403).end('Origem não autorizada.');
    return;
  }
  if (!safeTokenEquals(requestUrl.searchParams.get('token'))) {
    res.writeHead(401).end('Token inválido.');
    return;
  }

  const rawTarget = requestUrl.searchParams.get('url');
  let target;
  try {
    target = new URL(rawTarget || '');
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Protocolo inválido.');
  } catch {
    res.writeHead(400).end('URL inválida.');
    return;
  }

  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => {
    if (!res.writableEnded) abortController.abort();
  });

  const liveTransport = /\.ts(?:$|\?)/i.test(target.href) || /\/live\//i.test(target.pathname);
  const headers = {
    Accept: '*/*',
    'Accept-Encoding': 'identity',
    'User-Agent': liveTransport
      ? 'VLC/3.0.20 LibVLC/3.0.20'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
  };
  if (req.headers.range) headers.Range = req.headers.range;
  if (liveTransport) headers['Icy-MetaData'] = '1';

  try {
    const { response: upstream, target: finalTarget } = await openUpstream(
      target,
      req.method,
      headers,
      abortController.signal,
    );
    copyResponseHeaders(upstream, res, finalTarget);
    const status = upstream.statusCode || 502;
    if (req.method === 'HEAD') {
      upstream.destroy();
      res.writeHead(status).end();
      return;
    }

    const contentType = String(upstream.headers['content-type'] || '');
    const isHls = /(?:application|audio)\/(?:vnd\.apple\.mpegurl|x-mpegurl)/i.test(contentType) || /\.m3u8(?:$|\?)/i.test(finalTarget.href);
    if (isHls) {
      const manifest = await readLimitedText(upstream);
      const forwardedProto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
      const proxyBase = `${forwardedProto}://${req.headers.host}/stream`;
      const wrap = (value) => {
        try {
          const absolute = new URL(value, finalTarget).href;
          return `${proxyBase}?url=${encodeURIComponent(absolute)}&token=${encodeURIComponent(PROXY_TOKEN)}`;
        } catch {
          return value;
        }
      };
      const rewritten = manifest
        .split(/\r?\n/)
        .map((line) => {
          if (!line) return line;
          if (!line.startsWith('#')) return wrap(line.trim());
          return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${wrap(uri)}"`);
        })
        .join('\n');
      res.removeHeader('Content-Length');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.writeHead(status).end(rewritten);
      return;
    }

    res.writeHead(status);
    upstream.pipe(res);
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(abortController.signal.aborted ? 499 : 502).end(
        abortController.signal.aborted ? 'Stream cancelado.' : 'Falha ao conectar ao stream.',
      );
    } else {
      res.destroy(error);
    }
  }
});

server.requestTimeout = 0;
server.headersTimeout = 30000;
server.keepAliveTimeout = 5000;
server.listen(PORT, HOST, () => {
  console.log(`nexus-stream-proxy ativo em http://${HOST}:${PORT}`);
});

