import { ArrowLeft, Clapperboard, Film, Tv } from 'lucide-react';
import type { Channel } from '@/types';
import type { View } from '@/components/layout/Sidebar';
import { VideoPlayer } from '@/components/VideoPlayer';

interface PlaybackViewProps {
  channel: Channel;
  onNavigate: (view: View) => void;
}

function contentKind(channel: Channel) {
  if (channel.category === 'series' || channel.id.startsWith('episode:')) return 'series';
  if (channel.category === 'movies' || channel.id.startsWith('movie:')) return 'movies';
  return 'live';
}

export function PlaybackView({ channel, onNavigate }: PlaybackViewProps) {
  const kind = contentKind(channel);
  const Icon = kind === 'series' ? Clapperboard : kind === 'movies' ? Film : Tv;
  const label = kind === 'series' ? 'Voltar para a série' : kind === 'movies' ? 'Voltar para filmes' : 'Voltar aos canais';

  return <div className="-mx-5 -mt-6 min-h-screen bg-[#091018] px-5 py-6 sm:-mx-8 sm:px-8 lg:-mx-10 lg:-mt-8 lg:px-10 lg:py-8">
    <div className="mx-auto max-w-[1500px]">
      <button onClick={() => onNavigate(kind)} className="mb-5 flex items-center gap-2 rounded-xl bg-white/[0.055] px-4 py-2.5 text-sm text-white/65 transition hover:bg-white/[0.09] hover:text-white"><ArrowLeft className="h-4 w-4" />{label}</button>
      <section className="overflow-hidden rounded-3xl bg-white/[0.035] p-3 sm:p-4">
        <div className="aspect-video max-h-[calc(100vh-12rem)] overflow-hidden rounded-2xl bg-black"><VideoPlayer channel={channel} /></div>
        <div className="flex items-center gap-3 px-2 pb-1 pt-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><Icon className="h-5 w-5" /></span><span className="min-w-0"><strong className="block truncate text-base text-white">{channel.name}</strong><small className="block truncate text-white/35">{channel.group || (kind === 'series' ? 'Episódio' : 'Filme')}</small></span></div>
      </section>
    </div>
  </div>;
}
