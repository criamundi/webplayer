import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const root = process.cwd();
const loaded = loadEnv('tizen', root, 'VITE_');
const env = { ...loaded, ...process.env };

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const missing = required.filter((name) => !String(env[name] || '').trim());

if (missing.length) {
  const localPath = resolve(root, '.env.tizen.local');
  console.error('\nTizen build blocked: backend configuration is missing.');
  console.error(`Missing: ${missing.join(', ')}`);
  console.error('Create .env.tizen.local in the project root with:');
  console.error('  VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co');
  console.error('  VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA');
  console.error(`Expected file: ${localPath}`);
  if (!existsSync(localPath)) console.error('The file does not exist yet.');
  console.error('This check prevents a black-screen TV build caused by undefined Supabase settings.\n');
  process.exit(1);
}

try {
  const url = new URL(String(env.VITE_SUPABASE_URL));
  if (!/^https?:$/.test(url.protocol)) throw new Error('invalid protocol');
} catch {
  console.error('\nTizen build blocked: VITE_SUPABASE_URL is not a valid http(s) URL.\n');
  process.exit(1);
}

console.log('Tizen environment OK: Supabase URL + anon key found.');
