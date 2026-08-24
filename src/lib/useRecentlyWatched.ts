import { useState } from 'react';
import type { Channel } from '@/types';
import { storage } from '@/lib/storage';

export function useRecentlyWatched() {
  const [recents, setRecents] = useState<Channel[]>(() => storage.getRecentItems());
  const addRecent = (channel: Channel) => {
    setRecents((current) => {
      const next = [channel, ...current.filter((item) => item.id !== channel.id)].slice(0, 30);
      storage.saveRecentItems(next);
      return next;
    });
  };
  return { recents, addRecent };
}
