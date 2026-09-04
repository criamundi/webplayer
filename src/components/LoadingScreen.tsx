import { Loader2, Tv, X } from 'lucide-react';

interface LoadingBranding {
  app_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
}

const defaultBranding: LoadingBranding = {
  app_name: 'Top TV Digital',
  logo_url: null,
  primary_color: '#bef264',
  secondary_color: '#091018',
};

interface LoadingScreenProps {
  message: string;
  branding?: LoadingBranding;
  onCancel?: () => void;
  channelCount?: number;
  groupCount?: number;
}

export function LoadingScreen({ message, branding, onCancel, channelCount, groupCount }: LoadingScreenProps) {
  const visualBranding = branding || defaultBranding;
  const logo = visualBranding.logo_url ? (
    <img src={visualBranding.logo_url} alt={visualBranding.app_name} className="h-16 w-16 rounded-3xl object-contain" />
  ) : (
    <div className="flex h-16 w-16 items-center justify-center rounded-3xl text-slate-950 shadow-lg" style={{ backgroundColor: visualBranding.primary_color }}>
      <Tv className="h-8 w-8" />
    </div>
  );

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#091018] px-5 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(46,72,86,.28),transparent_42%)]" />
      <div className="relative flex flex-col items-center">
        <div className="mb-6 animate-pulse">{logo}</div>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">{visualBranding.app_name}</h1>
        <div className="flex items-center gap-2 text-sm text-white/55">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: visualBranding.primary_color }} />
          {message}
        </div>

        <p className="mt-3 text-center text-xs text-white/30">Sua lista está sendo preparada. Isso pode levar alguns instantes.</p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-8 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>
        )}
      </div>
    </main>
  );
}
