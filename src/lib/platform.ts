export type AppPlatform = 'web' | 'tizen' | 'webos';

declare global {
  interface Window {
    tizen?: {
      tvinputdevice?: {
        registerKey?: (keyName: string) => void;
        registerKeyBatch?: (keyNames: string[]) => void;
      };
    };
    webOS?: unknown;
    webOSSystem?: unknown;
  }
}

function detectPlatform(): AppPlatform {
  if (typeof window === 'undefined') return 'web';

  const userAgent = navigator.userAgent.toLowerCase();

  if (window.tizen || userAgent.includes('tizen')) return 'tizen';
  if (window.webOS || window.webOSSystem || userAgent.includes('web0s') || userAgent.includes('webos')) return 'webos';

  return 'web';
}

export const platform = {
  kind: detectPlatform(),

  get isTV() {
    return this.kind === 'tizen' || this.kind === 'webos';
  },

  get isSamsung() {
    return this.kind === 'tizen';
  },

  get isLG() {
    return this.kind === 'webos';
  },
};

const BACK_KEYS = new Set(['Escape', 'BrowserBack', 'GoBack']);
const BACK_KEY_CODES = new Set([27, 461, 10009]);
const DIRECTION_BY_CODE: Record<number, 'up' | 'down' | 'left' | 'right' | undefined> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
};
const DIRECTION_BY_KEY: Record<string, 'up' | 'down' | 'left' | 'right' | undefined> = {
  ArrowUp: 'up',
  Up: 'up',
  ArrowDown: 'down',
  Down: 'down',
  ArrowLeft: 'left',
  Left: 'left',
  ArrowRight: 'right',
  Right: 'right',
};

export function isBackKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const isEditable =
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable;

  if (event.key === 'Backspace' && isEditable) return false;

  return BACK_KEYS.has(event.key) || BACK_KEY_CODES.has(event.keyCode || event.which);
}

function isElementVisible(element: HTMLElement) {
  if (element.getAttribute('aria-hidden') === 'true') return false;
  if (element.hasAttribute('disabled')) return false;

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || '1') > 0.02;
}

const FOCUS_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[data-tv-focus="true"]',
].join(',');

type Direction = 'up' | 'down' | 'left' | 'right';
interface FocusEntry { element: HTMLElement; rect: DOMRect; }

let focusSnapshot: FocusEntry[] = [];
let focusSnapshotDirty = true;
let markedFocus: HTMLElement | null = null;
let lastRepeatMoveAt = 0;

export function invalidateTVFocusMap() {
  focusSnapshotDirty = true;
}

function focusableElements(): FocusEntry[] {
  if (!focusSnapshotDirty) return focusSnapshot;

  focusSnapshot = Array.from(document.querySelectorAll<HTMLElement>(FOCUS_SELECTOR))
    .filter(isElementVisible)
    .map((element) => ({ element, rect: element.getBoundingClientRect() }));
  focusSnapshotDirty = false;
  return focusSnapshot;
}

function centerOf(rect: DOMRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function overlapRatio(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const base = Math.max(1, Math.min(aEnd - aStart, bEnd - bStart));
  return overlap / base;
}

function scopedCandidate(current: HTMLElement, direction: Direction) {
  const scope = current.closest<HTMLElement>('[data-tv-axis],[data-tv-grid-columns]');
  if (!scope) return null;

  const items = Array.from(scope.querySelectorAll<HTMLElement>(FOCUS_SELECTOR)).filter((item) => {
    if (item.closest('[data-tv-axis],[data-tv-grid-columns]') !== scope) return false;
    return item.getAttribute('aria-hidden') !== 'true' && !item.hasAttribute('disabled');
  });
  const currentIndex = items.indexOf(current);
  if (currentIndex < 0) return null;

  const axis = scope.dataset.tvAxis;
  if (axis === 'horizontal' && (direction === 'left' || direction === 'right')) {
    return items[currentIndex + (direction === 'right' ? 1 : -1)] ?? null;
  }
  if (axis === 'vertical' && (direction === 'up' || direction === 'down')) {
    return items[currentIndex + (direction === 'down' ? 1 : -1)] ?? null;
  }

  const columns = Number.parseInt(scope.dataset.tvGridColumns || '', 10);
  if (columns > 0) {
    const row = Math.floor(currentIndex / columns);
    const nextIndex = direction === 'left'
      ? currentIndex - 1
      : direction === 'right'
        ? currentIndex + 1
        : direction === 'up'
          ? currentIndex - columns
          : currentIndex + columns;

    if (nextIndex < 0 || nextIndex >= items.length) return null;
    if (direction === 'left' || direction === 'right') {
      if (Math.floor(nextIndex / columns) !== row) return null;
    }
    return items[nextIndex] ?? null;
  }

  return null;
}

function spatialCandidate(current: HTMLElement, direction: Direction) {
  const currentRect = current.getBoundingClientRect();
  const currentCenter = centerOf(currentRect);
  const horizontal = direction === 'left' || direction === 'right';

  let best: { element: HTMLElement; score: number } | null = null;

  for (const entry of focusableElements()) {
    const { element, rect } = entry;
    if (element === current) continue;
    const center = centerOf(rect);
    const dx = center.x - currentCenter.x;
    const dy = center.y - currentCenter.y;

    const valid =
      (direction === 'left' && rect.right <= currentRect.left + 12) ||
      (direction === 'right' && rect.left >= currentRect.right - 12) ||
      (direction === 'up' && rect.bottom <= currentRect.top + 12) ||
      (direction === 'down' && rect.top >= currentRect.bottom - 12);

    if (!valid) continue;

    const primary = horizontal
      ? Math.max(0, direction === 'left' ? currentRect.left - rect.right : rect.left - currentRect.right)
      : Math.max(0, direction === 'up' ? currentRect.top - rect.bottom : rect.top - currentRect.bottom);
    const secondary = horizontal ? Math.abs(dy) : Math.abs(dx);
    const overlap = horizontal
      ? overlapRatio(currentRect.top, currentRect.bottom, rect.top, rect.bottom)
      : overlapRatio(currentRect.left, currentRect.right, rect.left, rect.right);

    // Netflix-like navigation: favor a card in the same row/column, then distance.
    const sameAxisBonus = overlap > 0.18 ? -900 * overlap : 0;
    const anglePenalty = secondary > primary * 2.2 ? secondary * 3.5 : secondary * 1.65;
    const score = primary * 1.15 + anglePenalty + sameAxisBonus;

    if (!best || score < best.score) best = { element, score };
  }

  return best?.element ?? null;
}

function preferredFocusTarget() {
  const selectors = [
    '[data-tv-autofocus="true"]',
    '[data-tv-priority="primary"]',
    '.home-hero button',
    '.home-shortcut',
    '.media-poster-focus',
    '.live-channel-main',
    '.sidebar-item-active',
  ];

  for (const selector of selectors) {
    const target = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isElementVisible);
    if (target) return target;
  }

  return focusableElements()[0]?.element ?? null;
}

export function focusFirstInteractive(force = false) {
  const current = document.activeElement;
  if (!force && current instanceof HTMLElement && current !== document.body && isElementVisible(current)) return;

  if (force) invalidateTVFocusMap();
  const target = preferredFocusTarget();
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
}

function markFocusedElement(element: HTMLElement | null) {
  if (markedFocus && markedFocus !== element) markedFocus.removeAttribute('data-tv-focused');
  if (element) element.setAttribute('data-tv-focused', 'true');
  markedFocus = element;
}

export function installTVRuntime() {
  if (typeof window === 'undefined') return () => {};

  document.documentElement.dataset.platform = platform.kind;
  document.documentElement.classList.toggle('is-tv', platform.isTV);
  document.documentElement.classList.toggle('is-samsung-tv', platform.isSamsung);

  if (platform.isSamsung) {
    const keys = [
      'MediaPlay',
      'MediaPause',
      'MediaPlayPause',
      'MediaStop',
      'MediaFastForward',
      'MediaRewind',
      'ChannelUp',
      'ChannelDown',
    ];

    try {
      if (window.tizen?.tvinputdevice?.registerKeyBatch) {
        window.tizen.tvinputdevice.registerKeyBatch(keys);
      } else {
        keys.forEach((key) => {
          try {
            window.tizen?.tvinputdevice?.registerKey?.(key);
          } catch {
            // Alguns modelos não expõem todas as teclas.
          }
        });
      }
    } catch {
      // Navegador web / simulador sem API Tizen completa.
    }
  }

  const onFocusIn = (event: FocusEvent) => {
    if (!platform.isTV) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    markFocusedElement(target);
    document.documentElement.classList.toggle('tv-has-focus', Boolean(target));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isBackKey(event)) {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('top-tv:back'));
      return;
    }

    if (!platform.isTV || event.defaultPrevented) return;

    const keyCode = event.keyCode || event.which;
    const direction = DIRECTION_BY_KEY[event.key] || DIRECTION_BY_CODE[keyCode];

    if (!direction) {
      if ((event.key === 'Enter' || keyCode === 13) && document.activeElement instanceof HTMLElement) {
        const active = document.activeElement;
        const nativeInteractive = ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
        if (!nativeInteractive && active.getAttribute('role') === 'button') {
          event.preventDefault();
          active.click();
        }
      }
      return;
    }

    if (event.repeat) {
      const now = performance.now();
      if (now - lastRepeatMoveAt < 65) {
        event.preventDefault();
        return;
      }
      lastRepeatMoveAt = now;
    }

    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !isElementVisible(active)) {
      event.preventDefault();
      focusFirstInteractive(true);
      return;
    }

    const explicitSelector = active.dataset[`tv${direction[0].toUpperCase()}${direction.slice(1)}` as keyof DOMStringMap];
    const explicitTarget = explicitSelector
      ? document.querySelector<HTMLElement>(explicitSelector)
      : null;
    const target = explicitTarget || scopedCandidate(active, direction) || spatialCandidate(active, direction);
    if (!target) return;

    event.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
    invalidateTVFocusMap();
  };

  const onLayoutShift = () => invalidateTVFocusMap();

  // O mapa fica sujo quando a tela muda, mas a leitura do DOM só ocorre na
  // próxima tecla. A versão anterior media a tela inteira repetidamente.
  const observer = platform.isTV
    ? new MutationObserver(invalidateTVFocusMap)
    : null;

  // Componentes especializados (player, canais e grids) recebem a tecla
  // primeiro. O motor global só completa a navegação quando ela não foi
  // tratada localmente.
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onLayoutShift, { passive: true });
  document.addEventListener('scroll', onLayoutShift, { capture: true, passive: true });
  document.addEventListener('focusin', onFocusIn, true);
  observer?.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
  window.setTimeout(() => focusFirstInteractive(true), 350);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onLayoutShift);
    document.removeEventListener('scroll', onLayoutShift, true);
    document.removeEventListener('focusin', onFocusIn, true);
    observer?.disconnect();
  };
}

let pseudoFullscreenElement: HTMLElement | null = null;

export function isAppFullscreen() {
  return Boolean(document.fullscreenElement || pseudoFullscreenElement);
}

export async function enterAppFullscreen(element: HTMLElement = document.documentElement) {
  if (document.fullscreenElement) return true;

  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen({ navigationUI: 'hide' });
      return true;
    }
  } catch {
    // TV browsers may reject the standard fullscreen API.
  }

  if (platform.isTV) {
    pseudoFullscreenElement = element;
    element.classList.add('tv-pseudo-fullscreen');
    document.body.classList.add('tv-fullscreen-active');
    return true;
  }

  return false;
}

export async function exitAppFullscreen() {
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen?.();
    } catch {
      // Browser may already be leaving fullscreen.
    }
  }

  if (pseudoFullscreenElement) {
    pseudoFullscreenElement.classList.remove('tv-pseudo-fullscreen');
    pseudoFullscreenElement = null;
  }

  document.body.classList.remove('tv-fullscreen-active');
}

export async function toggleAppFullscreen(element: HTMLElement = document.documentElement) {
  if (isAppFullscreen()) {
    await exitAppFullscreen();
    return false;
  }

  await enterAppFullscreen(element);
  return true;
}
