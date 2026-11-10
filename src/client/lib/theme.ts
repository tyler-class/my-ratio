// Light / Dark / System, remembered per device. index.html applies the saved choice
// before first paint; this keeps it in sync when changed in Settings.
import { useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'ratio-theme';
const COLORS = { light: '#f5eee3', dark: '#150f0b' } as const;

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  const metas = document.querySelectorAll('meta[name=theme-color]');
  metas.forEach((m) => {
    const media = m.getAttribute('media') ?? '';
    const sys = media.includes('dark') ? COLORS.dark : COLORS.light;
    m.setAttribute('content', t === 'system' ? sys : COLORS[t]);
  });
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const setTheme = (t: Theme) => {
    try {
      if (t === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      /* private mode: still applies for this visit */
    }
    applyTheme(t);
    setThemeState(t);
  };
  return [theme, setTheme] as const;
}
