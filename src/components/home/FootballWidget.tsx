import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Play, RefreshCw } from 'lucide-react';
import { loadTodayMatches, resolveMatchesBroadcasts, type ResolvedBroadcast, type TodayMatch } from '@/lib/sports';
import type { Channel } from '@/types';

interface FootballWidgetProps {
  primaryColor: string;
  secondaryColor: string;
  onClose: () => void;
  onSelectChannel: (channel: Channel) => void;
}

const ROTATION_MS = 15_000;

function teamInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function readableText(color: string) {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return '#061014';
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return ((red * 299 + green * 587 + blue * 114) / 1000) > 145 ? '#061014' : '#ffffff';
}

function TeamLogo({ source, name, compact = false }: { source?: string; name: string; compact?: boolean }) {
  const [failedSource, setFailedSource] = useState('');
  const size = compact ? 'h-8 w-8 text-[9px]' : 'h-14 w-14 text-xs';
  if (source && failedSource !== source) {
    return <img src={source} alt={`Escudo do ${name}`} loading="lazy" onError={() => setFailedSource(source)} className={`${size} object-contain`} />;
  }
  return <span className={`flex ${size} items-center justify-center rounded-full bg-white/[.07] font-bold text-white/45`}>{teamInitials(name)}</span>;
}

function ChannelButtons({ channels, color, onSelectChannel, compact = false }: { channels: ResolvedBroadcast[]; color: string; onSelectChannel: (channel: Channel) => void; compact?: boolean }) {
  const textColor = readableText(color);
  return <div className={`flex flex-wrap ${compact ? 'gap-1.5' : 'gap-2'}`}>
    {channels.map(({ name, channel }) => <button
      key={channel.id}
      type="button"
      onClick={(event) => { event.stopPropagation(); onSelectChannel(channel); }}
      className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition hover:brightness-110 active:scale-[.98] ${compact ? 'px-2.5 py-1.5 text-[9px]' : 'px-3 py-2 text-[10px]'}`}
      style={{ backgroundColor: color, color: textColor }}
      title={`Assistir em ${channel.name}`}
    ><Play className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} fill-current`} />{name}</button>)}
  </div>;
}

export function FootballWidget({ primaryColor, secondaryColor, onClose: _onClose, onSelectChannel }: FootballWidgetProps) {
  const [matches, setMatches] = useState<TodayMatch[]>([]);
  const [broadcasts, setBroadcasts] = useState<Record<string, ResolvedBroadcast[]>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [rotationKey, setRotationKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextMatches = await loadTodayMatches();
      setMatches(nextMatches);
      setActiveIndex(0);
      setRotationKey((value) => value + 1);
      setBroadcasts({});
      setLoading(false);
      const resolveBroadcasts = async () => {
        const resolved = await resolveMatchesBroadcasts(nextMatches).catch(() => ({}));
        setBroadcasts(resolved);
        return resolved;
      };
      const firstResolved = await resolveBroadcasts();
      const hasAnyBroadcast = Object.values(firstResolved).some((items) => items.length > 0);
      if (!hasAnyBroadcast) {
        window.setTimeout(() => { void resolveBroadcasts(); }, 3_000);
        window.setTimeout(() => { void resolveBroadcasts(); }, 10_000);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os jogos de hoje.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (matches.length < 2) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setActiveIndex((current) => (current + 1) % matches.length);
      setRotationKey((value) => value + 1);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [matches.length]);

  const activeMatch = matches[activeIndex];
  const probabilities = activeMatch?.probabilities || { home: 40, draw: 30, away: 30 };
  const currentDate = useMemo(() => {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      timeZone: 'America/Sao_Paulo',
    }).format(now).replace('.', '').toUpperCase();

    const dayMonth = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(now).replace('.', '').toUpperCase();

    return { weekday, dayMonth };
  }, []);

  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex items-center justify-between px-5 py-4">
      <div className="min-w-0"><span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-white/30">Central do jogo</span><strong className="mt-0.5 block truncate text-sm font-semibold text-white">Partidas em destaque</strong></div>
      <div className="flex items-center gap-3">
        <span className="min-w-[6.5rem] text-right uppercase leading-tight text-white/30">
          <span className="block text-[8px] tracking-[.13em]">{currentDate.weekday}</span>
          <span className="mt-1 block text-[10px] font-semibold tracking-[.08em] text-white/45">{currentDate.dayMonth}</span>
        </span>
      </div>
    </header>

    <div className="sports-rotation-track" aria-hidden="true"><span key={rotationKey} className="sports-rotation-progress" style={{ backgroundColor: primaryColor }} /></div>

    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3 scrollbar-none">
      {loading && <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-xs text-white/35"><LoaderCircle className="h-7 w-7 animate-spin" style={{ color: primaryColor }} />Carregando partidas de hoje</div>}
      {!loading && error && <div className="flex min-h-72 flex-col items-center justify-center px-5 text-center"><p className="text-sm text-white/55">{error}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/[.08] px-4 py-2.5 text-xs font-semibold text-white/75 transition hover:bg-white/[.12]"><RefreshCw className="h-3.5 w-3.5" />Tentar novamente</button></div>}
      {!loading && !error && !activeMatch && <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><strong className="text-sm text-white/70">Nenhuma partida encontrada hoje</strong><p className="mt-2 text-xs leading-5 text-white/35">A agenda será atualizada automaticamente quando houver jogos nas competições acompanhadas.</p></div>}

      {!loading && activeMatch && <>
        <section className="rounded-2xl bg-white/[.045] p-4">
          <div className="flex items-center justify-between gap-3"><span className="truncate text-[9px] font-semibold uppercase tracking-[0.15em]" style={{ color: primaryColor }}>{activeMatch.competition || 'Futebol'}</span><span className="shrink-0 rounded-lg bg-white/[.08] px-3 py-2 text-xs font-bold tabular-nums text-white shadow-inner shadow-black/20">{activeMatch.time}</span></div>
          <div className="mt-4 grid grid-cols-[7.5rem_3.25rem_7.5rem] items-center justify-center gap-3">
            <div className="flex w-[7.5rem] min-w-0 flex-col items-center text-center"><TeamLogo source={activeMatch.homeLogo} name={activeMatch.home} /><strong className="mt-2 line-clamp-2 text-xs font-semibold leading-4 text-white">{activeMatch.home}</strong></div>
            <span className="mx-auto flex h-9 w-14 items-center justify-center rounded-full bg-white/[.06] text-[10px] font-bold uppercase tracking-[.12em] text-white/45">VS</span>
            <div className="flex w-[7.5rem] min-w-0 flex-col items-center text-center"><TeamLogo source={activeMatch.awayLogo} name={activeMatch.away} /><strong className="mt-2 line-clamp-2 text-xs font-semibold leading-4 text-white">{activeMatch.away}</strong></div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[9px] text-white/40"><span>Probabilidade estimada</span></div>
            <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
              <span style={{ width: `${probabilities.home}%`, backgroundColor: primaryColor }} />
              <span className="bg-white/25" style={{ width: `${probabilities.draw}%` }} />
              <span style={{ width: `${probabilities.away}%`, backgroundColor: secondaryColor }} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] font-semibold text-white/38">
              <span className="truncate text-left">{activeMatch.home} · {probabilities.home}%</span>
              <span className="text-center">Empate · {probabilities.draw}%</span>
              <span className="truncate text-right">{activeMatch.away} · {probabilities.away}%</span>
            </div>
          </div>

          <div className="mt-5"><span className="mb-2 block text-[9px] font-semibold uppercase tracking-[.15em] text-white/35">Onde assistir</span>{broadcasts[activeMatch.id]?.length ? <ChannelButtons channels={broadcasts[activeMatch.id]} color={primaryColor} onSelectChannel={onSelectChannel} /> : <p className="text-[10px] leading-4 text-white/30">Buscando o canal disponível na sua lista…</p>}</div>
        </section>

        <section className="mt-5"><h3 className="mb-2 text-[9px] font-semibold uppercase tracking-[.18em] text-white/30">Jogos do dia</h3><div className="space-y-1.5">{matches.map((match, index) => <div
          key={match.id}
          className={`rounded-xl px-2.5 py-2.5 transition ${index === activeIndex ? 'bg-white/[.08]' : 'bg-white/[.025] hover:bg-white/[.055]'}`}
        ><button
          type="button"
          onClick={() => { setActiveIndex(index); setRotationKey((value) => value + 1); }}
          className="grid w-full grid-cols-[3.2rem_2.25rem_minmax(0,1fr)_2.75rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-left"
        >
          <span className="rounded-lg bg-white/[.07] px-2 py-2 text-center text-[10px] font-bold tabular-nums text-white/80">{match.time}</span>
          <span className="flex justify-center"><TeamLogo compact source={match.homeLogo} name={match.home} /></span>
          <strong className="truncate text-[10px] font-semibold text-white/78">{match.home}</strong>
          <span className="justify-self-center rounded-full bg-white/[.06] px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-white/40">VS</span>
          <strong className="truncate text-right text-[10px] font-semibold text-white/78">{match.away}</strong>
          <span className="flex justify-center"><TeamLogo compact source={match.awayLogo} name={match.away} /></span>
        </button>{broadcasts[match.id]?.length ? <div className="mt-2.5 pl-11"><ChannelButtons compact channels={broadcasts[match.id]} color={primaryColor} onSelectChannel={onSelectChannel} /></div> : null}</div>)}</div></section>
      </>}
    </div>
  </div>;
}
