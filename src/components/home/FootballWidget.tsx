
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw, X } from 'lucide-react';
import { getCachedSportsSettings, loadTodayMatches, type TodayMatch } from '@/lib/sports';

interface FootballWidgetProps {
  primaryColor: string;
  onClose: () => void;
}

const ROTATION_MS = 15_000;

function WostiWidget() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const script = document.createElement('script');

    script.src =
      'https://widgets.futbolenlatv.com/js/js?w=300&h=600&color=000&culture=pt-BR';

    script.async = true;

    container.appendChild(script);

    return () => {
      script.remove();
      container.replaceChildren();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="min-h-[600px] w-full overflow-auto rounded-xl bg-black"
    />
  );
}

function teamInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function TeamLogo({
  source,
  name,
  compact = false,
}: {
  source?: string;
  name: string;
  compact?: boolean;
}) {
  const [failedSource, setFailedSource] = useState('');
  const size = compact
    ? 'h-8 w-8 text-[9px]'
    : 'h-14 w-14 text-xs';

  if (source && failedSource !== source) {
    return (
      <img
        src={source}
        alt={`Escudo do ${name}`}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedSource(source)}
        className={`${size} object-contain`}
      />
    );
  }

  return (
    <span
      className={`flex ${size} items-center justify-center rounded-full bg-white/[.07] font-bold text-white/45`}
    >
      {teamInitials(name)}
    </span>
  );
}

function groupMatchesByCompetition(matches: TodayMatch[]) {
  const groups = new Map<string, TodayMatch[]>();

  for (const match of matches) {
    const competition = match.competition?.trim() || 'Outros';
    const current = groups.get(competition) || [];
    current.push(match);
    groups.set(competition, current);
  }

  const brazilPriority = (name: string) => {
    const normalized = name.toLocaleLowerCase('pt-BR');

    return /brasileir|copa do brasil|libertadores|sul-americana|paulista|carioca|mineiro|gaúcho|gaucho|nordeste/i.test(normalized)
      ? 0
      : 1;
  };

  return Array.from(groups.entries())
    .map(([competition, items]) => ({
      competition,
      matches: items,
    }))
    .sort(
      (left, right) =>
        brazilPriority(left.competition) -
          brazilPriority(right.competition) ||
        left.competition.localeCompare(right.competition, 'pt-BR')
    );
}

export function FootballWidget({
  primaryColor,
  onClose,
}: FootballWidgetProps) {
  const [matches, setMatches] = useState<TodayMatch[]>([]);
  const [activeTab, setActiveTab] = useState<'tv' | 'games'>('tv');
  const [activeIndex, setActiveIndex] = useState(0);
  const [rotationKey, setRotationKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const settings = getCachedSportsSettings();

    if (!settings.enabled) {
      setMatches([]);
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const nextMatches = await loadTodayMatches();
      setMatches(nextMatches);
      setActiveIndex(0);
      setRotationKey((value) => value + 1);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Não foi possível carregar os jogos de hoje.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const retry = window.setTimeout(() => {
      void load();
    }, 2500);

    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearTimeout(retry);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  useEffect(() => {
    if (matches.length < 2 || activeTab !== 'games') return;

    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') {
        setRotationKey((value) => value + 1);
        return;
      }

      setActiveIndex((current) => (current + 1) % matches.length);
      setRotationKey((value) => value + 1);
    }, ROTATION_MS);

    return () => window.clearTimeout(timer);
  }, [matches.length, activeIndex, rotationKey, activeTab]);

  const activeMatch = matches[activeIndex];

  const currentDate = useMemo(() => {
    const now = new Date();

    const weekday = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      timeZone: 'America/Sao_Paulo',
    })
      .format(now)
      .replace('.', '')
      .toUpperCase();

    const dayMonth = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      timeZone: 'America/Sao_Paulo',
    })
      .format(now)
      .replace('.', '')
      .toUpperCase();

    return { weekday, dayMonth };
  }, []);

  const competitionGroups = useMemo(
    () => groupMatchesByCompetition(matches),
    [matches]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.08] text-white/50 transition hover:bg-white/[.14] hover:text-white"
            aria-label="Fechar Jogos do Dia"
            title="Fechar Jogos do Dia"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <span className="block text-[9px] font-semibold uppercase tracking-[.05em] text-white/30">
              Central do jogo
            </span>
            <strong className="mt-0.5 block truncate text-sm font-semibold text-white">
              Partidas em destaque
            </strong>
          </div>
        </div>

        <span className="min-w-[6.5rem] text-right uppercase leading-tight text-white/30">
          <span className="block text-[8px] tracking-[.05em]">
            {currentDate.weekday}
          </span>
          <span className="mt-1 block text-[10px] font-semibold tracking-[.05em] text-white/45">
            {currentDate.dayMonth}
          </span>
        </span>
      </header>

      <div
        className="flex gap-2 border-y border-white/[.06] px-4 py-3"
        role="tablist"
        aria-label="Visões dos jogos"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tv'}
          onClick={() => setActiveTab('tv')}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
            activeTab === 'tv'
              ? 'bg-white/[.12] text-white'
              : 'text-white/50 hover:bg-white/[.07]'
          }`}
        >
          Onde assistir
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'games'}
          onClick={() => setActiveTab('games')}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
            activeTab === 'games'
              ? 'bg-white/[.12] text-white'
              : 'text-white/50 hover:bg-white/[.07]'
          }`}
        >
          Detalhes dos jogos
        </button>
      </div>

      {activeTab === 'tv' ? (
        <div
          className="min-h-0 flex-1 overflow-y-auto bg-[#0b1319] px-2 pb-3 pt-2"
          role="tabpanel"
          aria-label="Programação de transmissões"
        >
          <WostiWidget />
        </div>
      ) : (
        <>
          <div
            className="sports-rotation-track"
            aria-hidden="true"
          >
            <span
              key={rotationKey}
              className="sports-rotation-progress"
              style={{
                backgroundColor: primaryColor,
                animationDuration: `${ROTATION_MS}ms`,
              }}
            />
          </div>

          <div className="sports-widget-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3 scrollbar-none">
            {loading && (
              <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-xs text-white/35">
                <LoaderCircle
                  className="h-7 w-7 animate-spin"
                  style={{ color: primaryColor }}
                />
                Carregando partidas de hoje
              </div>
            )}

            {!loading && error && (
              <div className="flex min-h-72 flex-col items-center justify-center px-5 text-center">
                <p className="text-sm text-white/55">{error}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/[.08] px-4 py-2.5 text-xs font-semibold text-white/75 transition hover:bg-white/[.12]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Tentar novamente
                </button>
              </div>
            )}

            {!loading && !error && !activeMatch && (
              <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
                <strong className="text-sm text-white/70">
                  Nenhuma partida encontrada hoje
                </strong>
                <p className="mt-2 text-xs leading-5 text-white/35">
                  A agenda será atualizada automaticamente quando houver jogos
                  nas competições acompanhadas.
                </p>
              </div>
            )}

            {!loading && activeMatch && (
              <>
                <section className="sports-featured-card rounded-2xl bg-white/[.045] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="truncate text-[12px] font-extrabold uppercase tracking-[.05em]"
                      style={{ color: primaryColor }}
                    >
                      {activeMatch.competition || 'Futebol'}
                    </span>
                    <span className="shrink-0 rounded-lg bg-white/[.10] px-3.5 py-2.5 text-[14px] font-extrabold tabular-nums text-white shadow-inner shadow-black/20">
                      {activeMatch.time}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] items-center justify-center gap-3">
                    <div className="flex min-w-0 flex-col items-center text-center">
                      <TeamLogo
                        source={activeMatch.homeLogo}
                        name={activeMatch.home}
                      />
                      <strong className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-white">
                        {activeMatch.home}
                      </strong>
                    </div>

                    <span className="mx-auto flex h-9 w-14 items-center justify-center rounded-full bg-white/[.06] text-[10px] font-bold uppercase text-white/45">
                      VS
                    </span>

                    <div className="flex min-w-0 flex-col items-center text-center">
                      <TeamLogo
                        source={activeMatch.awayLogo}
                        name={activeMatch.away}
                      />
                      <strong className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-white">
                        {activeMatch.away}
                      </strong>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl bg-black/20 px-3.5 py-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[.05em] text-white/45">
                      Onde assistir
                    </span>

                    {activeMatch.channels.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {activeMatch.channels.map((channel) => (
                          <span
                            key={channel}
                            className="rounded-lg bg-white/[.09] px-2.5 py-1.5 text-xs font-semibold text-white/85"
                          >
                            {channel}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-white/40">
                        Transmissão não informada
                      </p>
                    )}
                  </div>
                </section>

                <section className="sports-matches-list mt-5">
                  <div className="space-y-6">
                    {competitionGroups.map((group) => (
                      <section key={group.competition}>
                        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-white/[.055] px-3.5 py-3">
                          <strong
                            className="truncate text-[13px] font-extrabold uppercase tracking-[.05em]"
                            style={{ color: primaryColor }}
                          >
                            {group.competition}
                          </strong>
                          <span className="shrink-0 text-[11px] font-semibold text-white/40">
                            {group.matches.length}{' '}
                            {group.matches.length === 1 ? 'jogo' : 'jogos'}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {group.matches.map((match) => {
                            const index = matches.findIndex(
                              (item) => item.id === match.id
                            );

                            return (
                              <div
                                key={match.id}
                                className={`rounded-xl px-2.5 py-2.5 transition ${
                                  index === activeIndex
                                    ? 'bg-white/[.08]'
                                    : 'bg-white/[.025] hover:bg-white/[.055]'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveIndex(index);
                                    setRotationKey((value) => value + 1);
                                  }}
                                  className="grid w-full grid-cols-[3.2rem_2.25rem_minmax(0,1fr)_2.75rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-left"
                                >
                                  <span className="rounded-lg bg-white/[.10] px-2 py-2.5 text-center text-[12px] font-extrabold tabular-nums text-white">
                                    {match.time}
                                  </span>

                                  <span className="flex justify-center">
                                    <TeamLogo
                                      compact
                                      source={match.homeLogo}
                                      name={match.home}
                                    />
                                  </span>

                                  <strong className="truncate text-[12px] font-semibold text-white/88">
                                    {match.home}
                                  </strong>

                                  <span className="justify-self-center rounded-full bg-white/[.08] px-2.5 py-1.5 text-[10px] font-bold uppercase text-white/55">
                                    VS
                                  </span>

                                  <strong className="truncate text-right text-[12px] font-semibold text-white/88">
                                    {match.away}
                                  </strong>

                                  <span className="flex justify-center">
                                    <TeamLogo
                                      compact
                                      source={match.awayLogo}
                                      name={match.away}
                                    />
                                  </span>
                                </button>

                                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-1 text-[10px] text-white/45">
                                  <span>Transmissão:</span>

                                  {match.channels.length
                                    ? match.channels.map((channel) => (
                                        <span
                                          key={channel}
                                          className="rounded-md bg-black/25 px-1.5 py-0.5 text-white/70"
                                        >
                                          {channel}
                                        </span>
                                      ))
                                    : <span>não informada</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
