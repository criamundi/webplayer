export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  favorite?: boolean;
  category?: 'live' | 'movies' | 'series' | 'radio' | 'other';
  parentSeriesId?: string;
}

export interface Playlist {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  channelCount?: number;
}

export interface ParsedPlaylist {
  channels: Channel[];
  groups: string[];
}
