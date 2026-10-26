/** 客户端设置（本地持久化） */

export interface Settings {
  sensitivity: number;      // 鼠标灵敏度 0.2 ~ 3
  fov: number;              // 视场角 60 ~ 110
  masterVolume: number;     // 0 ~ 1
  sfxVolume: number;
  musicVolume: number;
  quality: 'low' | 'medium' | 'high';
  showDamage: boolean;      // 伤害数字
  invertY: boolean;
}

const KEY = 'cs2_settings_v1';

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1.0,
  fov: 78,
  masterVolume: 0.8,
  sfxVolume: 1.0,
  musicVolume: 0.5,
  quality: 'high',
  showDamage: true,
  invertY: false,
};

let cached: Settings | null = null;

export function loadSettings(): Settings {
  if (cached) return cached;
  let loaded: Settings;
  try {
    const raw = localStorage.getItem(KEY);
    loaded = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    loaded = { ...DEFAULT_SETTINGS };
  }
  cached = loaded;
  return loaded;
}

export function saveSettings(s: Settings): void {
  cached = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
