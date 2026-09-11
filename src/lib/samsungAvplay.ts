export function hasSamsungAVPlay() {
  const avplay = window.webapis?.avplay as { open?: unknown } | undefined;
  return typeof avplay?.open === 'function';
}
