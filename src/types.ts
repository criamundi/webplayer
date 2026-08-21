export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  favorite?: boolean;
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
