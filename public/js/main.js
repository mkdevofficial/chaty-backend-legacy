import { state, setUser, clearSessionState } from './state.js';
import { bootstrap, onUnauthorized } from './api.js';
import { t } from './i18n.js';
import { applyVisuals, applyUserPreferences } from './theme.js';
import { toast } from './ui.js';
import {
  registerRoute,
  initRouter,
  navigateTab,
} from './router.js';
import { renderAuth } from './auth.js';
import { renderChats } from './chats.js';
import { renderChat } from './chat.js';
import { renderFriends } from './friends.js';
import { renderSearch } from './search.js';
import { renderProfile, renderUser } from './profile.js';

const app = document.getElementById('app');
let viewRoot = null;
let navRoot = null;

registerRoute('chats', renderChats);
registerRoute('chat', renderChat);
registerRoute('friends', renderFriends);
registerRoute('search', renderSearch);
registerRoute('profile', renderProfile);
registerRoute('user', renderUser);

function mountShell() {
  app.innerHTML = `
    <div class="app-shell">
      <main class="view-root" id="view-root"></main>
      <nav class="bottom-nav" id="bottom-nav" aria-label="${t('app.navigation')}"></nav>
    </div>`;
  viewRoot = app.querySelector('#view-root');
  navRoot = app.querySelector('#bottom-nav');
  initRouter({ view: viewRoot, nav: navRoot });
  navigateTab('chats');
}

function showAuth() {
  viewRoot = null;
  navRoot = null;
  renderAuth(app, { onAuthed: mountShell });
}

function handleSignedOut(expired = false) {
  clearSessionState();
  showAuth();
  if (expired) toast(t('errors.unauthorized'), 'error');
}

onUnauthorized(() => handleSignedOut(true));
document.addEventListener('chaty:logout', () => handleSignedOut(false));
document.addEventListener('chaty:language', () => {
  if (viewRoot && navRoot) initRouter({ view: viewRoot, nav: navRoot });
});

async function boot() {
  applyVisuals({
    theme: state.theme,
    accent: state.accent,
    wallpaper: state.wallpaper,
    lang: state.lang,
  });
  try {
    const data = await bootstrap();
    setUser(data.user);
    if (data.limits) state.limits = data.limits;
    if (data.user) {
      applyUserPreferences(data.user);
      mountShell();
    } else {
      showAuth();
    }
  } catch {
    showAuth();
    toast(t('errors.network'), 'error');
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

boot();
