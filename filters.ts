const MOVIE_PATTERN = /filme|filmes|movie|movies|lançamento|ação|aventura|animação|comedy|drama|horror|thriller/i;
const SERIES_PATTERN = /s[eé]rie|s[eé]ries|series|temporada|season|tv\s?show/i;

export function isMovieGroup(group: string): boolean {
  return MOVIE_PATTERN.test(group);
}

export function isSeriesGroup(group: string): boolean {
  return SERIES_PATTERN.test(group);
}
