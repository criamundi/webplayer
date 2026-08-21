import { memo } from 'react';
import { Heart, Play, Tv2 } from 'lucide-react';
import type { Channel } from '@/types';

interface ChannelCardProps {
  channel: Channel;
  isFavorite?: boolean;
  onSelect: (channel: Channel) => void;
  onToggleFavorite?: (id: string) => void;
  variant?: 'poster' | 'landscape';
}

export const ChannelCard = memo(function ChannelCard({
  channel,
  isFavorite,
  onSelect,
  onToggleFavorite,
  variant = 'poster',
}: ChannelCardProps) {
  const aspectClass = variant === 'poster' ? 'aspect-[2/3]' : 'aspect-[16/10]';

  return (
    <button onClick={() => onSelect(channel)} className="group min-w-0 text-left">
      <div
        className={`relative ${aspectClass} overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-lg shadow-black/20 transition-transform duration-300 group-hover:-translate-y-1`}
      >
        {channel.logo ? (
          <img
            src={channel.logo}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105 group-hover:opacity-70"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback instanceof HTMLElement) fallback.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className={`${channel.logo ? 'hidden' : 'flex'} h-full items-center justify-center p-4 text-center`}
          style={{ display: channel.logo ? 'none' : undefined }}
        >
          <Tv2 className="h-8 w-8 text-white/20" />
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

        {channel.group && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-md">
            {channel.group}
          </span>
        )}

        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(channel.id);
            }}
            className={`absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md transition ${
              isFavorite
                ? 'bg-amber-400/20 text-amber-300'
                : 'bg-black/25 text-white/60 opacity-0 group-hover:opacity-100'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-amber-300' : ''}`} />
          </button>
        )}

        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lime-300 text-slate-950 shadow-xl shadow-lime-300/25">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </span>

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="truncate text-sm font-semibold text-white">{channel.name}</p>
        </div>
      </div>
    </button>
  );
});
