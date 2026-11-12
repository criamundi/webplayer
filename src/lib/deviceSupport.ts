/** Código para localizar o cadastro; não é senha nem autoriza acesso. */
export function deviceSupportCode(deviceKey: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < deviceKey.length; index++) {
    const code = deviceKey.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  const value = (first >>> 0).toString(16).padStart(8,'0') + (second >>> 0).toString(16).padStart(8,'0');
  return `TV-${value.toUpperCase().match(/.{4}/g)!.join('-')}`;
}
export function matchesSupportSearch(query: string, values: Array<string | null | undefined>): boolean {
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  if (!needle) return true;
  const compact = needle.replace(/[^a-z0-9]/g,'');
  return values.some(value => {
    const text = (value || '').toLocaleLowerCase('pt-BR');
    return text.includes(needle) || (compact.length >= 4 && text.replace(/[^a-z0-9]/g,'').includes(compact));
  });
}
