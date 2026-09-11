import { supabase } from '@/lib/supabase';
import { platform } from '@/lib/platform';
import { storage } from '@/lib/storage';

declare global {
  interface Window {
    webapis?: {
      productinfo?: {
        getDuid?: () => string;
        getModel?: () => string;
        getModelCode?: () => string;
        getFirmware?: () => string;
      };
      appcommon?: {
        getUuid?: () => string;
      };
    };
  }
}

export interface TvDeviceIdentity {
  deviceKey: string;
  platform: 'tizen' | 'webos';
  model: string | null;
  modelCode: string | null;
  firmware: string | null;
  appVersion: string;
  name: string;
}

const APP_VERSION = '0.7.34';
let lastRegistrationAt = 0;

function safeRead(reader?: () => string) {
  try {
    const value = reader?.();
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function fallbackDeviceKey() {
  const storageKey = 'top-tv-device-key';
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;

  const generated = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(storageKey, generated);
  return generated;
}

export function getTvDeviceIdentity(): TvDeviceIdentity | null {
  if (!platform.isTV) return null;

  if (platform.isSamsung) {
    const product = window.webapis?.productinfo;
    const duid = safeRead(product?.getDuid?.bind(product));
    const model = safeRead(product?.getModel?.bind(product));
    const modelCode = safeRead(product?.getModelCode?.bind(product));
    const firmware = safeRead(product?.getFirmware?.bind(product));
    const uuid = safeRead(window.webapis?.appcommon?.getUuid?.bind(window.webapis?.appcommon));
    const deviceKey = duid || uuid || fallbackDeviceKey();

    return {
      deviceKey,
      platform: 'tizen',
      model,
      modelCode,
      firmware,
      appVersion: APP_VERSION,
      name: modelCode ? `Samsung ${modelCode}` : model ? `Samsung ${model}` : 'Samsung TV',
    };
  }

  return {
    deviceKey: fallbackDeviceKey(),
    platform: 'webos',
    model: null,
    modelCode: null,
    firmware: null,
    appVersion: APP_VERSION,
    name: 'LG TV',
  };
}

export async function registerCurrentTvDevice(force = false) {
  if (!platform.isTV) return null;
  const now = Date.now();
  if (!force && now - lastRegistrationAt < 10 * 60_000) return null;

  const credentials = storage.getCredentials();
  const identity = getTvDeviceIdentity();
  if (!credentials || !identity) return null;

  const { data, error } = await supabase.functions.invoke('register-tv-device', {
    body: {
      provider: credentials.provider,
      username: credentials.username,
      password: credentials.password,
      device: identity,
    },
  });

  if (error) throw error;
  lastRegistrationAt = now;
  return data;
}
