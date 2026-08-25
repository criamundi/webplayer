import type { Channel } from '@/types';
import { VideoPlayer } from '@/components/VideoPlayer';

interface PlaybackViewProps {
  channel: Channel;
  onClose: () => void;
}

export function PlaybackView({ channel, onClose }: PlaybackViewProps) {
  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onClose();
  };

  return <div className="fixed inset-0 z-[100] bg-black"><VideoPlayer channel={channel} immersive onClose={close} /></div>;
}
