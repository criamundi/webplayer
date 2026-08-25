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
  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onNavigate(kind);
  };

  return <div className="fixed inset-0 z-[100] bg-black"><VideoPlayer channel={channel} immersive onClose={close} /></div>;
}
