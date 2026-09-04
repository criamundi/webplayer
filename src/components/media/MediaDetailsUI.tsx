import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Star, Tv, UserRound } from 'lucide-react';
import { getPlayableStreamUrl } from '@/lib/streamProxy';
import type { SeriesCastMember } from '@/lib/provider';
import { mediaRating } from '@/components/media/mediaUtils';

function imageCandidates(...values: Array<string | undefined>) {
  const candidates: string[] = [];
  for (const value of values) {
    const source = value?.trim();
    if (!source || candidates.includes(source)) continue;
    candidates.push(source);
    if (/^http:\/\//i.test(source) && !source.includes('/functions/v1/stream-proxy')) {
      const proxied = getPlayableStreamUrl(source);
      if (proxied && !candidates.includes(proxied)) candidates.push(proxied);
    }
  }
  return candidates;
}

export function MediaBackdrop({ sources }: { sources: string[] }) {
  const available = useMemo(() => imageCandidates(...sources), [sources]);
  const signature = available.join('|');
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [signature]);
  const source = available[index];
  if (!source) return null;
  return <img key={source} src={source} alt="" onError={() => setIndex((current) => current + 1)} className="absolute inset-0 h-full w-full object-cover" />;
}

export function MediaCover({ logo, fallbackLogo, name, preserveAspect = false, priority = false }: { logo?: string; fallbackLogo?: string; name: string; preserveAspect?: boolean; priority?: boolean }) {
  const candidates = useMemo(() => imageCandidates(logo, fallbackLogo), [fallbackLogo, logo]);
  const signature = candidates.join('|');
  const firstCandidate = candidates[0];
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(Boolean(firstCandidate));

  useEffect(() => {
    setIndex(0);
    setLoading(Boolean(firstCandidate));
  }, [firstCandidate, signature]);

  const source = candidates[index];
  const handleError = () => {
    setIndex((current) => current + 1);
    setLoading(Boolean(candidates[index + 1]));
  };

  return <>
    {loading && <span className="absolute inset-0 z-10 flex items-center justify-center bg-[#111a20]"><Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--brand-primary, #bef264)' }} /></span>}
    {source
      ? <>{preserveAspect && <img src={source} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-xl" />}<img src={source} alt={name} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" onLoad={() => setLoading(false)} onError={handleError} className={preserveAspect ? 'relative z-[1] h-full w-full object-contain' : 'h-full w-full object-cover transition duration-300'} /></>
      : <span className="flex h-full items-center justify-center"><Tv className="h-9 w-9 text-white/15" /></span>}
  </>;
}

export function MediaHeroTitle({ logo, name }: { logo?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [logo]);
  const displayName = name.replace(/\s*(?:\[\s*l\s*\]|\(\s*l\s*\))\s*$/i, '').trim() || name;
  if (!logo || failed) return <h1 className="text-4xl font-semibold leading-none tracking-tight lg:text-6xl">{displayName}</h1>;
  return <img src={logo} alt={displayName} decoding="async" fetchPriority="high" onError={() => setFailed(true)} className="max-h-28 max-w-[min(78vw,24rem)] object-contain object-left" />;
}

export function MediaSynopsis({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const paragraphRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setExpanded(false);
    setCanExpand(false);
  }, [text]);

  useLayoutEffect(() => {
    if (expanded) return;
    const paragraph = paragraphRef.current;
    if (!paragraph) return;

    const measureOverflow = () => setCanExpand(paragraph.scrollHeight > paragraph.clientHeight + 1);
    measureOverflow();

    const observer = new ResizeObserver(measureOverflow);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [expanded, text]);

  return <div className="mt-4 max-w-2xl">
    <p ref={paragraphRef} className={`${expanded ? '' : 'line-clamp-3'} text-sm leading-6 text-white/55`}>{text}</p>
    {canExpand && <button
      type="button"
      onClick={() => setExpanded((current) => !current)}
      aria-expanded={expanded}
      className="mt-1.5 text-sm font-medium text-emerald-400 transition hover:text-emerald-300"
    >
      {expanded ? 'Mostrar menos' : 'Saiba mais'}
    </button>}
  </div>;
}

export function MediaRatingBadge({ value }: { value: unknown }) {
  const rating = mediaRating(value);
  if (!rating) return null;
  return <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/75 px-2 py-1 text-[10px] font-semibold text-amber-300 backdrop-blur"><Star className="h-3 w-3 fill-current" />{rating}</span>;
}

export function MediaCastPortrait({ member }: { member: SeriesCastMember }) {
  const candidates = useMemo(() => imageCandidates(member.image), [member.image]);
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [member.image]);
  const source = candidates[index];
  return <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-white/[0.05]">
    {source
      ? <img src={source} alt={member.name} loading="lazy" decoding="async" onError={() => setIndex((current) => current + 1)} className="h-full w-full object-cover object-top" />
      : <span className="flex h-full items-center justify-center"><UserRound className="h-10 w-10 text-white/15" /></span>}
  </div>;
}

export function MediaArrowRow({ title, children }: { title: string; children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) => {
    const track = trackRef.current;
    const firstItem = track?.querySelector<HTMLElement>('[data-arrow-item]');
    if (!track || !firstItem) return;
    const gap = Number.parseFloat(getComputedStyle(track).gap) || 16;
    track.scrollBy({ left: direction * (firstItem.offsetWidth + gap), behavior: 'smooth' });
  };

  return <div>
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => scroll(-1)} className="shelf-arrow" aria-label={`Voltar em ${title}`}><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => scroll(1)} className="shelf-arrow" aria-label={`Avançar em ${title}`}><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
    <div ref={trackRef} className="flex snap-x snap-mandatory gap-4 overflow-hidden scroll-smooth pb-4">{children}</div>
  </div>;
}
