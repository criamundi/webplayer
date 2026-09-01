import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CircleUserRound, KeyRound, LoaderCircle, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { loadAccountStatus, type AccountStatus } from '@/lib/provider';
import { storage } from '@/lib/storage';

interface SettingsViewProps {
  onSignOut: () => void;
}

function formatExpiry(value: string | null | undefined) {
  if (!value) return 'Não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function statusLabel(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'active') return 'Ativo';
  if (normalized === 'expired') return 'Vencido';
  if (normalized === 'disabled') return 'Desativado';
  if (normalized === 'banned') return 'Bloqueado';
  return status || 'Ativo';
}

export function SettingsView({ onSignOut }: SettingsViewProps) {
  const credentials = useMemo(() => storage.getCredentials(), []);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    void loadAccountStatus()
      .then((result) => {
        if (mounted) setAccount(result);
      })
      .catch(() => {
        if (mounted) setAccount(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const fields = [
    {
      label: 'Status',
      value: loading ? 'Verificando...' : statusLabel(account?.status),
      icon: ShieldCheck,
    },
    {
      label: 'Login',
      value: credentials?.username || 'Não informado',
      icon: UserRound,
    },
    {
      label: 'Nome do usuário',
      value: account?.displayName || account?.username || credentials?.username || 'Não informado',
      icon: CircleUserRound,
    },
    {
      label: 'Senha',
      value: credentials?.password || 'Não informada',
      icon: KeyRound,
    },
    {
      label: 'Data de validade da lista de reprodução',
      value: loading ? 'Verificando...' : formatExpiry(account?.expiresAt),
      icon: CalendarDays,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl py-4 sm:py-8">
      <div className="mb-7">
        <p className="mb-2 text-sm font-medium text-lime-300">Sua conta</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Configurações</h1>
        <p className="mt-3 text-sm leading-6 text-white/45">
          Informações do acesso atual à sua lista.
        </p>
      </div>

      <section className="overflow-hidden rounded-3xl bg-white/[0.035]">
        {fields.map(({ label, value, icon: Icon }, index) => (
          <div
            key={label}
            className={`flex min-h-[4.8rem] items-center gap-4 px-5 py-4 sm:px-6 ${
              index > 0 ? 'border-t border-white/[0.055]' : ''
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.055] text-lime-300">
              {loading && label === 'Status'
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : <Icon className="h-4 w-4" />}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/30">{label}</p>
              <p className="mt-1 break-all text-sm font-medium text-white/80">{value}</p>
            </div>
          </div>
        ))}
      </section>

      <button
        onClick={onSignOut}
        className="mt-6 flex min-h-12 items-center gap-2 rounded-xl bg-white/[.07] px-4 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/[.11] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <LogOut className="h-4 w-4" />
        Desconectar e trocar credenciais
      </button>

      <p className="mt-8 text-[11px] leading-5 text-white/25">
        Este produto utiliza a API do TMDB, mas não é endossado ou certificado pelo TMDB.
      </p>
    </div>
  );
}
