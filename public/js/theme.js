import { state, updatePrefs, cachePrefs } from './state.js';
import { setLanguage } from './i18n.js';

export const ACCENTS = ['teal', 'violet', 'rose', 'amber'];
export const WALLPAPERS = ['default', 'dots', 'waves', 'paper'];

export function applyVisuals(prefs = {}) {
  const theme = prefs.theme || state.theme;
  const accent = prefs.accent || state.accent;
  const wallpaper = prefs.wallpaper || state.wallpaper;
  const lang = prefs.lang || state.lang;

  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.wallpaper = wallpaper;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#eef2f9' : '#08111f');
  }
  updatePrefs({ theme, accent, wallpaper, lang });
  setLanguage(lang, { cache: false });
  cachePrefs();
}

export function applyUserPreferences(user) {
  if (!user) return;
  applyVisuals({
    theme: user.theme || 'dark',
    accent: user.accent || 'teal',
    wallpaper: user.wallpaper || 'default',
    lang: user.lang || 'ar',
  });
}

export function setTheme(theme) {
  applyVisuals({ theme });
}

export function toggleTheme() {
  applyVisuals({ theme: state.theme === 'dark' ? 'light' : 'dark' });
}
