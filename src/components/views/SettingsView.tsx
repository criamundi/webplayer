import { Clock3, LogOut, Radio, Star } from 'lucide-react';

interface SettingsViewProps {
  channelCount: number;
  favoriteCount: number;
  onSignOut: () => void;
}

export function SettingsView({ channelCount, favoriteCount, onSignOut }: SettingsViewProps) {
  return (
    <div className="mt-8 max-w-2xl space-y-8">
      <div>
        <p className="mb-2 text-sm font-medium text-lime-300">Sua conta</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Configuracoes</h1>
        <p className="mt-3 text-sm leading-6 text-white/45">
          Gerencie seu acesso e preferencias de reproducao.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <Clock3 className="mb-4 h-5 w-5 text-lime-300" />
          <p className="text-xs text-white/40">Canais carregados</p>
          <p className="mt-1 text-lg font-semibold">{channelCount}</p>
          <p className="mt-1 text-xs text-emerald-300">Lista ativa</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <Star className="mb-4 h-5 w-5 text-lime-300" />
          <p className="text-xs text-white/40">Favoritos</p>
          <p className="mt-1 text-lg font-semibold">{favoriteCount}</p>
          <p className="mt-1 text-xs text-white/40">Canais marcados</p>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-lime-300/15 p-3 text-lime-300">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">Acesso</h2>
            <p className="text-xs text-white/40">Voce esta conectado com suas credenciais.</p>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Desconectar e trocar credenciais
        </button>
      </div>

      <p className="text-[11px] leading-5 text-white/25">
        Este produto utiliza a API do TMDB, mas não é endossado ou certificado pelo TMDB.
      </p>
    </div>
  );
}
