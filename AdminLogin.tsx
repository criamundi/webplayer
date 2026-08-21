import { FormEvent, useState } from 'react';
import { Eye, EyeOff, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AdminLoginProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function AdminLogin({ onSuccess, onCancel }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError || !data.session) {
      setError('E-mail ou senha incorretos.');
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    if (profile?.role !== 'admin') {
      await supabase.auth.signOut();
      setError('Esta conta não tem permissão de administrador.');
      setLoading(false);
      return;
    }
    onSuccess();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#091018] px-5 py-10 text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(136,180,112,.2),transparent_42%)]" />
      <section className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-lime-300 text-slate-950 shadow-lg shadow-lime-300/20"><ShieldCheck className="h-7 w-7" /></div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel administrativo</h1>
          <p className="mt-2 text-sm text-white/45">Acesso restrito a administradores.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-white/60">E-mail</span>
            <span className="relative block">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-lime-300/50" placeholder="admin@exemplo.com" />
            </span>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-white/60">Senha</span>
            <span className="relative block">
              <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-12 text-sm text-white outline-none focus:border-lime-300/50" placeholder="••••••" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </span>
          </label>
          {error && <p className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-xs leading-5 text-red-200">{error}</p>}
          <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />} Entrar no painel
          </button>
        </form>
        <button onClick={onCancel} className="mt-4 w-full text-center text-xs text-white/30 transition hover:text-white/50">Voltar</button>
      </section>
    </main>
  );
}
