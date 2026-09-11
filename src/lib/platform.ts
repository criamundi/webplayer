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

function focusableElements(): HTMLElement[] {
  const selector = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[data-tv-focus="true"]',
  ].join(',');

  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(isElementVisible);
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

function spatialCandidate(current: HTMLElement, direction: 'up' | 'down' | 'left' | 'right') {
  const currentRect = current.getBoundingClientRect();
  const currentCenter = centerOf(currentRect);
  const horizontal = direction === 'left' || direction === 'right';

  let best: { element: HTMLElement; score: number } | null = null;

  for (const element of focusableElements()) {
    if (element === current) continue;

    const rect = element.getBoundingClientRect();
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

  return focusableElements()[0] ?? null;
}

export function focusFirstInteractive(force = false) {
  const current = document.activeElement;
  if (!force && current instanceof HTMLElement && current !== document.body && isElementVisible(current)) return;

  const target = preferredFocusTarget();
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
}

function markFocusedElement(element: HTMLElement | null) {
  document.querySelectorAll<HTMLElement>('[data-tv-focused="true"]').forEach((item) => {
    if (item !== element) item.removeAttribute('data-tv-focused');
  });
  if (element) element.setAttribute('data-tv-focused', 'true');
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
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
          event.preventDefault();
          active.click();
        }
      }
      return;
    }

    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !isElementVisible(active)) {
      event.preventDefault();
      focusFirstInteractive(true);
      return;
    }

    const target = spatialCandidate(active, direction);
    if (!target) return;

    event.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
  };

  const observer = platform.isTV
    ? new MutationObserver(() => {
        window.setTimeout(() => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement) || !isElementVisible(active)) focusFirstInteractive(true);
        }, 60);
      })
    : null;

  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('focusin', onFocusIn, true);
  observer?.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => focusFirstInteractive(true), 350);

  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
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
