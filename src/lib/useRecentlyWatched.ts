import { useState } from 'react';
import type { Channel } from '@/types';

export function useRecentlyWatched() {
  const [recents, setRecents] = useState<Channel[]>([]);
  const addRecent = (channel: Channel) => {
    setRecents((current) => [channel, ...current.filter((item) => item.id !== channel.id)].slice(0, 10));
  };
  return { recents, addRecent };
}
