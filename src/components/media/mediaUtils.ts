import type { SeriesCastMember } from '@/lib/provider';

export const mediaText = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

export const formatMediaDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

export function mediaRating(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const match = String(value).trim().replace(',', '.').match(/\d+(?:\.\d+)?/);
  if (!match || Number(match[0]) <= 0) return '';
  const rating = Number(match[0]);
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1).replace(/\.0$/, '');
}

export function mediaImageValue(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = mediaImageValue(item);
      if (image) return image;
    }
    return '';
  }
  if (typeof value !== 'string') return '';
  const source = value.trim();
  if (!source) return '';
  if (source.startsWith('[') || source.startsWith('{')) {
    try { return mediaImageValue(JSON.parse(source)); } catch { return ''; }
  }
  return source;
}

export function mediaCastList(value: unknown, fallback: unknown): SeriesCastMember[] {
  if (Array.isArray(value)) {
    return value.map((item) => item && typeof item === 'object' ? {
      name: mediaText((item as Record<string, unknown>).name),
      character: mediaText((item as Record<string, unknown>).character),
      image: mediaText((item as Record<string, unknown>).image),
    } : { name: mediaText(item) }).filter((item) => item.name);
  }
  return mediaText(fallback).split(',').map((name) => name.trim()).filter(Boolean).map((name) => ({ name }));
}
