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

const BACK_KEYS = new Set([
  'Escape',
  'BrowserBack',
  'GoBack',
]);

const BACK_KEY_CODES = new Set([
  27,     // Escape
  461,    // LG webOS Back
  10009,  // Samsung Tizen Return
]);

export function isBackKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const isEditable =
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable;

  if (event.key === 'Backspace' && isEditable) return false;

  return BACK_KEYS.has(event.key) || BACK_KEY_CODES.has(event.keyCode || event.which);
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

  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter((element) => {
      if (element.getAttribute('aria-hidden') === 'true') return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });
}

function spatialCandidate(current: HTMLElement, direction: 'up' | 'down' | 'left' | 'right') {
  const currentRect = current.getBoundingClientRect();
  const currentCenter = {
    x: currentRect.left + currentRect.width / 2,
    y: currentRect.top + currentRect.height / 2,
  };

  let best: { element: HTMLElement; score: number } | null = null;

  for (const element of focusableElements()) {
    if (element === current) continue;

    const rect = element.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    const dx = center.x - currentCenter.x;
    const dy = center.y - currentCenter.y;

    const valid =
      (direction === 'left' && dx < -4) ||
      (direction === 'right' && dx > 4) ||
      (direction === 'up' && dy < -4) ||
      (direction === 'down' && dy > 4);

    if (!valid) continue;

    const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
    const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = primary + secondary * 2.35;

    if (!best || score < best.score) best = { element, score };
  }

  return best?.element ?? null;
}

export function focusFirstInteractive() {
  const current = document.activeElement;
  if (current && current instanceof HTMLElement && current !== document.body) return;
  focusableElements()[0]?.focus();
}

export function installTVRuntime() {
  if (typeof window === 'undefined') return () => {};

  document.documentElement.dataset.platform = platform.kind;
  document.documentElement.classList.toggle('is-tv', platform.isTV);

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

  const onKeyDown = (event: KeyboardEvent) => {
    if (isBackKey(event)) {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('top-tv:back'));
      return;
    }

    if (!platform.isTV || event.defaultPrevented) return;

    const directionMap: Record<string, 'up' | 'down' | 'left' | 'right' | undefined> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };

    const direction = directionMap[event.key];
    if (!direction) return;

    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      focusFirstInteractive();
      return;
    }

    const target = spatialCandidate(active, direction);
    if (!target) return;

    event.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };

  window.addEventListener('keydown', onKeyDown);
  window.setTimeout(focusFirstInteractive, 250);

  return () => window.removeEventListener('keydown', onKeyDown);
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
