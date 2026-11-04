import { state } from './state.js';
import { t } from './i18n.js';
import { icon, escapeHtml, showError } from './ui.js';

const routes = {};
const TABS = new Set(['chats', 'friends', 'search', 'profile']);
const HIDE_NAV = new Set(['chat', 'user']);

let viewRoot = null;
let navRoot = null;
let currentCleanup = null;
let current = null;
let stack = [];
let navToken = 0;

export function registerRoute(name, renderer) {
  routes[name] = renderer;
}

export function initRouter({ view, nav }) {
  viewRoot = view;
  navRoot = nav;
  buildNav();
}

function buildNav() {
  if (!navRoot) return;
  const items = [
    { id: 'chats', icon: 'chat', label: t('nav.chats') },
    { id: 'friends', icon: 'users', label: t('nav.friends') },
    { id: 'search', icon: 'search', label: t('nav.search') },
    { id: 'profile', icon: 'user', label: t('nav.profile') },
  ];
  navRoot.innerHTML = items.map((item) => `
    <button type="button" class="nav-item" data-nav="${item.id}" aria-label="${escapeHtml(item.label)}">
      ${icon(item.icon, 22)}
      <span>${escapeHtml(item.label)}</span>
      ${item.id === 'chats' ? '<span class="nav-dot hidden" data-unread></span>' : ''}
    </button>`).join('');
  navRoot.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTab(btn.dataset.nav));
  });
  updateNav();
}

export function refreshNav() {
  if (!navRoot) return;
  const active = current ? current.name : state.tab;
  navRoot.querySelectorAll('[data-nav]').forEach((btn) => {
    const isActive = TABS.has(active) && btn.dataset.nav === active;
    btn.classList.toggle('active', isActive);
    if (isActive) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  updateNav();
}

export function updateNav() {
  if (!navRoot) return;
  const dot = navRoot.querySelector('[data-unread]');
  if (!dot) return;
  if (state.unreadTotal > 0) {
    dot.textContent = state.unreadTotal > 99 ? '99+' : String(state.unreadTotal);
    dot.classList.remove('hidden');
  } else {
    dot.classList.add('hidden');
  }
}

export async function navigate(name, params = {}, options = {}) {
  const renderer = routes[name];
  if (!renderer || !viewRoot) return;
  const token = ++navToken;

  if (currentCleanup) {
    try { currentCleanup(); } catch { /* ignore cleanup errors */ }
    currentCleanup = null;
  }

  if (current && !options.reset && !options.replace && !options.noPush) {
    stack.push(current);
    if (stack.length > 25) stack.shift();
  }
  if (options.reset) stack = [];

  const previous = current;
  current = { name, params };
  if (TABS.has(name)) state.tab = name;
  state.currentChatId = name === 'chat' ? params.id : null;

  document.body.dataset.view = name;
  if (navRoot) {
    navRoot.classList.toggle('hidden', HIDE_NAV.has(name));
    refreshNav();
  }
  viewRoot.innerHTML = '';

  try {
    const result = await renderer(viewRoot, params, { previous });
    if (token !== navToken) {
      if (typeof result === 'function') result();
      return;
    }
    currentCleanup = typeof result === 'function' ? result : null;
  } catch (error) {
    if (token === navToken) showError(error);
  }
}

export function navigateTab(name) {
  if (!TABS.has(name)) name = 'chats';
  return navigate(name, {}, { reset: true });
}

export function goBack() {
  if (stack.length) {
    const prev = stack.pop();
    return navigate(prev.name, prev.params, { replace: true, noPush: true });
  }
  return navigateTab('chats');
}

export function refreshRoute() {
  if (!current) return;
  return navigate(current.name, current.params, { replace: true, noPush: true });
}

export function currentRoute() {
  return current;
}

export function canGoBack() {
  return stack.length > 0;
}
