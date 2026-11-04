import { apiGet } from './api.js';
import { t, errorText } from './i18n.js';
import {
  icon,
  escapeHtml,
  avatarHtml,
  debounce,
  showError,
} from './ui.js';
import { navigate } from './router.js';
import { openConversationWithUser, setFollowing } from './actions.js';

export function renderSearch(root) {
  let disposed = false;
  let token = 0;
  let results = [];
  let query = '';

  root.innerHTML = `
    <section class="screen">
      <header class="topbar">
        <div class="brand-mark">${icon('search', 21)}</div>
        <div class="grow">
          <h1>${escapeHtml(t('search.title'))}</h1>
          <span class="topbar-subtitle">${escapeHtml(t('search.subtitle'))}</span>
        </div>
      </header>
      <div class="screen-body">
        <div class="search-shell">
          <div class="search-box">
            ${icon('search', 19)}
            <input type="search" id="search-input" autocomplete="off" placeholder="${escapeHtml(t('search.placeholder'))}" aria-label="${escapeHtml(t('search.placeholder'))}">
          </div>
        </div>
        <div class="search-results" data-results>
          <div class="empty-state">
            <div class="empty-art">${icon('search', 36)}</div>
            <h3>${escapeHtml(t('search.startTitle'))}</h3>
            <p>${escapeHtml(t('search.hint'))}</p>
          </div>
        </div>
      </div>
    </section>`;

  const input = root.querySelector('#search-input');
  const resultsEl = root.querySelector('[data-results]');

  function renderResults() {
    if (!query) {
      resultsEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-art">${icon('search', 36)}</div>
          <h3>${escapeHtml(t('search.startTitle'))}</h3>
          <p>${escapeHtml(t('search.hint'))}</p>
        </div>`;
      return;
    }
    if (!results.length) {
      resultsEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-art">${icon('users', 36)}</div>
          <h3>${escapeHtml(t('search.noResults'))}</h3>
          <p>${escapeHtml(t('search.noResultsText'))}</p>
        </div>`;
      return;
    }
    resultsEl.innerHTML = `
      <div class="section-head"><h2>${escapeHtml(t('search.title'))}</h2><span class="muted">${escapeHtml(t('search.resultCount', { count: results.length }))}</span></div>
      ${results.map((item) => {
        const user = item.user;
        return `
          <div class="user-result" data-user="${user.id}" style="cursor:pointer">
            ${avatarHtml(user, { size: 48, status: true })}
            <div class="user-main">
              <div class="user-name">${escapeHtml(user.display_name)}</div>
              <div class="user-handle">@${escapeHtml(user.username)} ${item.follows_me ? `· ${escapeHtml(t('friends.followsYou'))}` : ''}</div>
            </div>
            <div class="row-actions">
              <button type="button" class="mini-btn" data-message="${user.id}" title="${escapeHtml(t('friends.message'))}">${icon('messageCircle', 15)}</button>
              <button type="button" class="mini-btn ${item.is_following ? '' : 'accent'}" data-follow="${user.id}" data-following="${item.is_following ? '1' : '0'}">${escapeHtml(item.is_following ? t('friends.unfollow') : t('friends.follow'))}</button>
            </div>
          </div>`;
      }).join('')}`;

    resultsEl.querySelectorAll('[data-user]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        navigate('user', { id: Number(row.dataset.user) });
      });
    });
    resultsEl.querySelectorAll('[data-message]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        openConversationWithUser(Number(btn.dataset.message));
      });
    });
    resultsEl.querySelectorAll('[data-follow]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const id = Number(btn.dataset.follow);
        const isFollowing = btn.dataset.following === '1';
        btn.disabled = true;
        const result = await setFollowing(id, !isFollowing);
        if (result) {
          const item = results.find((entry) => Number(entry.user.id) === id);
          if (item) {
            item.is_following = !isFollowing;
            item.follows_me = Boolean(result.follows_me);
          }
          renderResults();
        } else {
          btn.disabled = false;
        }
      });
    });
  }

  async function runSearch(value) {
    const q = value.trim();
    query = q;
    if (!q) {
      results = [];
      renderResults();
      return;
    }
    const myToken = ++token;
    resultsEl.innerHTML = `<div style="display:grid;place-items:center;padding:36px"><div class="loader"></div><span class="faint" style="font-size:11px;margin-top:8px">${escapeHtml(t('search.searching'))}</span></div>`;
    try {
      const data = await apiGet('users', 'search', { q });
      if (disposed || myToken !== token) return;
      results = data.users || [];
      renderResults();
    } catch (error) {
      if (disposed || myToken !== token) return;
      results = [];
      resultsEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-art">${icon('info', 36)}</div>
          <h3>${escapeHtml(t('common.error'))}</h3>
          <p>${escapeHtml(errorText(error))}</p>
        </div>`;
      showError(error);
    }
  }

  const debounced = debounce(() => runSearch(input.value), 300);
  input.addEventListener('input', () => {
    query = input.value.trim();
    if (!query) {
      results = [];
      renderResults();
      return;
    }
    debounced();
  });
  input.addEventListener('search', () => runSearch(input.value));

  setTimeout(() => input.focus({ preventScroll: true }), 80);

  return () => {
    disposed = true;
    token += 1;
  };
}
