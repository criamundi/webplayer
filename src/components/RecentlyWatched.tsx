import { Play, Clock } from 'lucide-react';
import type { Channel } from '@/types';

interface RecentlyWatchedProps {
  channels: Channel[];
  onSelect: (ch: Channel) => void;
}

export function RecentlyWatched({ channels, onSelect }: RecentlyWatchedProps) {
  if (channels.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-white/60 flex items-center gap-1.5 px-1">
        <Clock className="w-3.5 h-3.5" />
        Vistos recentemente
      </h3>
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {channels.slice(0, 10).map((ch) => (
          <button
            key={ch.id}
            onClick={() => onSelect(ch)}
            className="group flex items-center gap-2 p-2 pr-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
              {ch.logo ? (
                <img
                  src={ch.logo}
                  alt=""
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <Play className="w-3.5 h-3.5 text-white/40" />
              )}
            </div>
            <span className="text-xs text-white/80 font-medium max-w-[100px] truncate">
              {ch.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
