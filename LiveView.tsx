import { memo } from 'react';
import { Radio } from 'lucide-react';

import type { Channel } from '@/types';

import { VideoPlayer } from '@/components/VideoPlayer';
import { ChannelList } from '@/components/ChannelList';
import { RecentlyWatched } from '@/components/RecentlyWatched';

interface LiveViewProps {
  channels: Channel[];
  activeChannel: Channel | null;
  favorites: Set<string>;
  recents: Channel[];
  onSelectChannel: (ch: Channel) => void;
  onToggleFavorite: (id: string) => void;
}

export const LiveView = memo(function LiveView({
  channels,
  activeChannel,
  favorites,
  recents,
  onSelectChannel,
  onToggleFavorite,
}: LiveViewProps) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-12">

      {/* PLAYER */}
      <section className="min-w-0 xl:col-span-8">

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3">

          <div className="aspect-video overflow-hidden rounded-2xl bg-black">

            <VideoPlayer
              channel={activeChannel}
            />

          </div>

        </div>

        {/* RECENTES */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">

          {recents.length > 0 ? (
            <RecentlyWatched
              channels={recents}
              onSelect={onSelectChannel}
            />
          ) : (
            <p className="text-sm text-white/40">
              Selecione um canal para começar a assistir.
            </p>
          )}

        </div>

      </section>

      {/* LISTA DE CANAIS */}
      <aside
        className="
          min-h-[520px]
          min-w-0
          overflow-hidden
          rounded-3xl
          border
          border-white/10
          bg-white/[0.04]
          p-4
          xl:col-span-4
        "
      >

        {channels.length > 0 ? (

          <div className="flex h-full min-h-0 flex-col">

            {/* CABEÇALHO */}
            <div className="mb-3 flex shrink-0 items-center justify-between">

              <div>
                <h2 className="text-sm font-semibold text-white">
                  Canais ao vivo
                </h2>

                <p className="mt-0.5 text-xs text-white/35">
                  {channels.length.toLocaleString('pt-BR')} canais
                </p>
              </div>

              {activeChannel && (
                <div className="flex items-center gap-1.5 text-xs text-lime-300/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />
                  Ao vivo
                </div>
              )}

            </div>

            {/* CONTAINER DA LISTA */}
            <div className="min-h-0 flex-1 overflow-hidden">

              <ChannelList
                channels={channels}
                favorites={favorites}
                onToggleFavorite={
                  onToggleFavorite
                }
                onSelect={
                  onSelectChannel
                }
                activeChannelId={
                  activeChannel?.id
                }
              />

            </div>

          </div>

        ) : (

          <div className="flex h-full flex-col items-center justify-center px-6 text-center">

            <Radio
              className="mb-4 h-9 w-9 text-white/25"
              aria-hidden="true"
            />

            <p className="text-sm font-semibold text-white/60">
              Nenhum canal carregado
            </p>

            <p className="mt-2 text-xs leading-5 text-white/35">
              Reconecte para liberar os canais ao vivo.
            </p>

          </div>

        )}

      </aside>

    </div>
  );
});