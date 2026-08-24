import { FormEvent, useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, Server, Tv, UserRound } from 'lucide-react';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

interface Branding {
  app_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  background_url?: string | null;
  login_background_url?: string | null;
}

interface ProviderAccessProps {
  branding: Branding;
  onConnecting: () => void;
  onError: (message: string) => void;
  onSuccess: () => void;
  controllerRef: React.MutableRefObject<AbortController | null>;
}

const defaultBranding: Branding = {
  app_name: 'Nexus Play',
  logo_url: null,
  primary_color: '#bef264',
  secondary_color: '#091018',
};

export function ProviderAccess({ branding, onConnecting, onError, onSuccess }: ProviderAccessProps) {
  const [provider, setProvider] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [providerBranding, setProviderBranding] = useState<Branding | null>(null);
  const visualBranding = providerBranding || branding || defaultBranding;

  useEffect(() => {
    const name = provider.trim();
    if (name.length < 2) { setProviderBranding(null); return; }
    setProviderBranding(null);
    const timer = window.setTimeout(async () => {
      const { data: providerRows } = await supabase.rpc('find_public_provider', { provider_name: name });
      const providerRow = providerRows?.[0];
      if (!providerRow) { setProviderBranding(null); return; }
      const { data } = await supabase.from('provider_branding').select('app_name, logo_url, primary_color, secondary_color, background_url, login_background_url').eq('provider_id', providerRow.id).maybeSingle();
      if (data) setProviderBranding(data as Branding);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [provider]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const cleanProvider = provider.trim();
    const cleanUsername = username.trim();
    if (!cleanProvider || !cleanUsername || !password) {
      const message = 'Preencha provedor, usuário e senha.';
      setError(message);
      onError(message);
      return;
    }

    // Apenas salva as credenciais. O App é o único responsável por conectar e
    // importar a playlist, evitando dois downloads simultâneos.
    storage.saveCredentials({ provider: cleanProvider, username: cleanUsername, password });
    onConnecting();
    onSuccess();
  };

  const buttonStyle = { backgroundColor: visualBranding.primary_color };
  const brandIdentity = visualBranding.logo_url
    ? <img src={visualBranding.logo_url} alt={visualBranding.app_name} className="max-h-24 max-w-[260px] object-contain object-left" />
    : <div className="flex items-center gap-3"><span className="flex h-14 w-14 items-center justify-center rounded-2xl text-slate-950 shadow-lg" style={buttonStyle}><Tv className="h-7 w-7" /></span><h1 className="text-2xl font-semibold tracking-tight">{visualBranding.app_name}</h1></div>;

  return (
    <main className="relative min-h-screen overflow-hidden bg-cover bg-center text-white" style={{ backgroundColor: visualBranding.secondary_color, backgroundImage: visualBranding.login_background_url ? `linear-gradient(90deg, rgba(9,16,24,.92), rgba(9,16,24,.55)), url(${visualBranding.login_background_url})` : undefined }}>
      <div className="absolute inset-0 opacity-50" style={{ background: `radial-gradient(circle at 14% 15%, ${visualBranding.primary_color}22, transparent 35%), radial-gradient(circle at 85% 80%, ${visualBranding.primary_color}12, transparent 30%)` }} />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-5 py-8 sm:px-8 lg:px-12">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1fr_440px] lg:gap-20">
          <section className="hidden max-w-xl lg:block">
            <div className="mb-10">{brandIdentity}</div>
            <p className="text-sm font-medium uppercase tracking-[0.22em]" style={{ color: visualBranding.primary_color }}>Bem-vindo</p>
            <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-[1.1] tracking-tight xl:text-5xl">Entre para assistir ao seu conteúdo.</h2>
            <p className="mt-6 max-w-md text-base leading-7 text-white/55">Use as credenciais fornecidas pelo seu provedor para acessar canais, filmes e séries em um só lugar.</p>
          </section>

          <section className="w-full rounded-[28px] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
            <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
              <div className="mb-5 lg:hidden">{brandIdentity}</div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">Acessar lista</h1>
              <p className="mt-2 text-sm text-white/45">Entre com os dados enviados pelo seu provedor.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block"><span className="mb-2 block text-xs font-medium text-white/60">Provedor</span><span className="relative block"><Server className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input required value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-white/30" placeholder="Nome do provedor" autoComplete="off" /></span></label>
              <label className="block"><span className="mb-2 block text-xs font-medium text-white/60">Usuário</span><span className="relative block"><UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-white/30" placeholder="Seu usuário" /></span></label>
              <label className="block"><span className="mb-2 block text-xs font-medium text-white/60">Senha</span><span className="relative block"><KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-12 text-sm text-white outline-none focus:border-white/30" placeholder="Sua senha" /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
              {error && <p className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-xs leading-5 text-red-200">{error}</p>}
              <button className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-slate-950 transition hover:brightness-110" style={buttonStyle}><LockKeyhole className="h-4 w-4" /> Entrar</button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
