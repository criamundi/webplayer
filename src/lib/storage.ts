import type { Channel, Playlist } from '@/types';

const PLAYLISTS_KEY = 'iptv:playlists';
const CHANNELS_KEY = 'iptv:channels';
const FAVORITES_KEY = 'iptv:favorites';
const FAVORITE_ITEMS_KEY = 'iptv:favorite-items';
const RECENTS_KEY = 'iptv:recents';
const RECENT_ITEMS_KEY = 'iptv:recent-items';
const CREDENTIALS_KEY = 'iptv:credentials';
const CACHE_KEY = 'iptv:cache';
const CACHE_MAX_BYTES = 4_500_000;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

export const storage = {
  getPlaylists: (): Playlist[] => read<Playlist[]>(PLAYLISTS_KEY, []),
  savePlaylists: (list: Playlist[]) => write(PLAYLISTS_KEY, list),

  getChannels: (): Record<string, Channel[]> => read(CHANNELS_KEY, {}),
  saveChannels: (map: Record<string, Channel[]>) => write(CHANNELS_KEY, map),

  getFavorites: (): string[] => read<string[]>(FAVORITES_KEY, []),
  saveFavorites: (ids: string[]) => write(FAVORITES_KEY, ids),
  getFavoriteItems: (): Record<string, Channel> => read<Record<string, Channel>>(FAVORITE_ITEMS_KEY, {}),
  saveFavoriteItem: (channel: Channel) => {
    const items = read<Record<string, Channel>>(FAVORITE_ITEMS_KEY, {});
    items[channel.id] = channel;
    write(FAVORITE_ITEMS_KEY, items);
  },
  removeFavoriteItem: (id: string) => {
    const items = read<Record<string, Channel>>(FAVORITE_ITEMS_KEY, {});
    delete items[id];
    write(FAVORITE_ITEMS_KEY, items);
  },

  getRecents: (): string[] => read<string[]>(RECENTS_KEY, []),
  saveRecents: (ids: string[]) => write(RECENTS_KEY, ids),
  getRecentItems: (): Channel[] => read<Channel[]>(RECENT_ITEMS_KEY, []),
  saveRecentItems: (items: Channel[]) => write(RECENT_ITEMS_KEY, items),

  getCredentials: (): { provider: string; username: string; password: string } | null => read<{ provider: string; username: string; password: string } | null>(CREDENTIALS_KEY, null),
  saveCredentials: (creds: { provider: string; username: string; password: string }) => write(CREDENTIALS_KEY, creds),
  clearCredentials: () => write(CREDENTIALS_KEY, null),

  getCache: (): { channels: Channel[]; groups: string[]; savedAt: number } | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw || raw.length > CACHE_MAX_BYTES) {
        if (raw) localStorage.removeItem(CACHE_KEY);
        return null;
      }
      const cached = JSON.parse(raw) as { channels: Channel[]; groups: string[]; savedAt: number };
      if (!cached || !Array.isArray(cached.channels) || !Array.isArray(cached.groups)) return null;
      return cached;
    } catch {
      return null;
    }
  },
  saveCache: (channels: Channel[], groups: string[]) => {
    if (channels.length > 100_000) {
      try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
      return;
    }
    try {
      const payload = JSON.stringify({ channels, groups, savedAt: Date.now() });
      if (payload.length > CACHE_MAX_BYTES) return;
      localStorage.setItem(CACHE_KEY, payload);
    } catch { /* storage full */ }
  },
  clearCache: () => { try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ } },
};
