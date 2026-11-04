const validThemes = ['light', 'dark'];
const validAccents = ['teal', 'violet', 'rose', 'amber'];
const validWallpapers = ['default', 'dots', 'waves', 'paper'];
const validLangs = ['ar', 'en'];

function readCache() {
  try {
    return JSON.parse(localStorage.getItem('chaty_prefs') || '{}');
  } catch {
    return {};
  }
}

const cached = readCache();

export const state = {
  user: null,
  csrf: null,
  limits: { image: 10485760, audio: 10485760, file: 26214400 },
  lang: validLangs.includes(cached.lang) ? cached.lang : 'ar',
  theme: validThemes.includes(cached.theme) ? cached.theme : 'dark',
  accent: validAccents.includes(cached.accent) ? cached.accent : 'teal',
  wallpaper: validWallpapers.includes(cached.wallpaper) ? cached.wallpaper : 'default',
  conversations: [],
  storyGroups: [],
  unreadTotal: 0,
  currentChatId: null,
  refreshChats: null,
  refreshStories: null,
  appVersion: 0,
};

export function setUser(user) {
  state.user = user || null;
  if (user) {
    if (validLangs.includes(user.lang)) state.lang = user.lang;
    if (validThemes.includes(user.theme)) state.theme = user.theme;
    if (validAccents.includes(user.accent)) state.accent = user.accent;
    if (validWallpapers.includes(user.wallpaper)) state.wallpaper = user.wallpaper;
    cachePrefs();
  }
}

export function setCsrf(token) {
  state.csrf = token || null;
}

export function cachePrefs() {
  try {
    localStorage.setItem(
      'chaty_prefs',
      JSON.stringify({
        lang: state.lang,
        theme: state.theme,
        accent: state.accent,
        wallpaper: state.wallpaper,
      })
    );
  } catch {
    /* storage can be unavailable in private mode */
  }
}

export function updatePrefs(prefs) {
  if (validLangs.includes(prefs.lang)) state.lang = prefs.lang;
  if (validThemes.includes(prefs.theme)) state.theme = prefs.theme;
  if (validAccents.includes(prefs.accent)) state.accent = prefs.accent;
  if (validWallpapers.includes(prefs.wallpaper)) state.wallpaper = prefs.wallpaper;
  cachePrefs();
}

export function clearSessionState() {
  state.user = null;
  state.csrf = null;
  state.conversations = [];
  state.storyGroups = [];
  state.unreadTotal = 0;
  state.currentChatId = null;
  state.refreshChats = null;
  state.refreshStories = null;
}
