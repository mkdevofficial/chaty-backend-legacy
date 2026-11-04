import { state } from './state.js';
import { apiGet } from './api.js';
import { t, errorText } from './i18n.js';
import {
  icon,
  escapeHtml,
  avatarHtml,
  skeletonRows,
  showError,
} from './ui.js';
import { navigate } from './router.js';
import { openConversationWithUser, setFollowing } from './actions.js';
import { loadStoryGroups, renderStoriesStrip } from './stories.js';

export function renderFriends(root) {
  let disposed = false;
  let tab = 'following';
  let data = { following: [], followers: [] };
  let followingIds = new Set();
  let storyTimer = null;

  root.innerHTML = `
    <section class="screen">
      <header class="topbar">
        <div class="brand-mark">${icon('users', 21)}</div>
        <div class="grow">
          <h1>${escapeHtml(t('friends.title'))}</h1>
          <span class="topbar-subtitle">${escapeHtml(t('search.subtitle'))}</span>
        </div>
        <button type="button" class="icon-btn soft" data-search aria-label="${escapeHtml(t('search.title'))}">${icon('search', 21)}</button>
      </header>
      <div class="screen-body">
        <div class="section-head">
          <h2>${escapeHtml(t('friends.stories'))}</h2>
        </div>
        <div class="stories-strip" data-stories></div>
        <div class="section-head">
          <h2>${escapeHtml(t('friends.people'))}</h2>
          <span class="muted" data-people-count></span>
        </div>
        <div class="seg-tabs">
          <button type="button" data-tab="following" class="active">${escapeHtml(t('friends.following'))} <span data-count-following></span></button>
          <button type="button" data-tab="followers">${escapeHtml(t('friends.followers'))} <span data-count-followers></span></button>
        </div>
        <div data-friend-list>
          ${skeletonRows(4)}
        </div>
      </div>
    </section>`;

  const storiesEl = root.querySelector('[data-stories]');
  const listEl = root.querySelector('[data-friend-list]');
  const countFollowing = root.querySelector('[data-count-following]');
  const countFollowers = root.querySelector('[data-count-followers]');
  const peopleCount = root.querySelector('[data-people-count]');

  root.querySelector('[data-search]').addEventListener('click', () => navigate('search'));

  async function refreshStories() {
    try {
      const groups = await loadStoryGroups();
      if (disposed) return;
      renderStoriesStrip(storiesEl, groups, { onChanged: refreshStories });
    } catch {
      if (!disposed) storiesEl.innerHTML = '';
    }
  }

  function currentList() {
    return tab === 'following' ? data.following : data.followers;
  }

  function render() {
    followingIds = new Set(data.following.map((user) => Number(user.id)));
    const list = currentList();
    countFollowing.textContent = String(data.following.length);
    countFollowers.textContent = String(data.followers.length);
    peopleCount.textContent = String(list.length);
    root.querySelectorAll('[data-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    if (!list.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-art">${icon('usersPlus', 36)}</div>
          <h3>${escapeHtml(t(tab === 'following' ? 'friends.emptyFollowing' : 'friends.emptyFollowers'))}</h3>
          <p>${escapeHtml(t('friends.emptyText'))}</p>
          <button type="button" class="btn btn-primary mt-8" data-empty-search>${icon('search', 18)} ${escapeHtml(t('search.title'))}</button>
        </div>`;
      listEl.querySelector('[data-empty-search]')?.addEventListener('click', () => navigate('search'));
      return;
    }
    listEl.innerHTML = `<div class="list">${list.map((user) => {
      const isFollowing = followingIds.has(Number(user.id));
      return `
        <div class="list-row user-result" data-user="${user.id}" style="cursor:pointer">
          ${avatarHtml(user, { size: 46, status: true })}
          <div class="user-main">
            <div class="user-name">${escapeHtml(user.display_name)}</div>
            <div class="user-handle">@${escapeHtml(user.username)} ${isFollowing && tab === 'followers' ? `· ${escapeHtml(t('friends.followsYou'))}` : ''}</div>
          </div>
          <div class="row-actions">
            <button type="button" class="mini-btn accent" data-message="${user.id}" title="${escapeHtml(t('friends.message'))}">${icon('messageCircle', 15)}</button>
            <button type="button" class="mini-btn ${isFollowing ? '' : 'accent'}" data-follow="${user.id}" data-following="${isFollowing ? '1' : '0'}">${escapeHtml(isFollowing ? t('friends.unfollow') : t('friends.follow'))}</button>
          </div>
        </div>`;
    }).join('')}</div>`;

    listEl.querySelectorAll('[data-user]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        navigate('user', { id: Number(row.dataset.user) });
      });
    });
    listEl.querySelectorAll('[data-message]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        openConversationWithUser(Number(btn.dataset.message));
      });
    });
    listEl.querySelectorAll('[data-follow]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const isFollowing = btn.dataset.following === '1';
        const user = [...data.following, ...data.followers].find((item) => Number(item.id) === Number(btn.dataset.follow));
        btn.disabled = true;
        const result = await setFollowing(Number(btn.dataset.follow), !isFollowing);
        if (result) {
          if (!isFollowing && user) {
            if (!data.following.some((item) => Number(item.id) === Number(user.id))) data.following.push(user);
          } else {
            data.following = data.following.filter((item) => Number(item.id) !== Number(btn.dataset.follow));
          }
          render();
        } else {
          btn.disabled = false;
        }
      });
    });
  }

  async function load() {
    try {
      const result = await apiGet('friends', 'lists');
      if (disposed) return;
      data = { following: result.following || [], followers: result.followers || [] };
      render();
    } catch (error) {
      if (disposed) return;
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-art">${icon('info', 36)}</div>
          <h3>${escapeHtml(t('common.error'))}</h3>
          <p>${escapeHtml(errorText(error))}</p>
          <button type="button" class="btn btn-ghost mt-8" data-retry>${escapeHtml(t('common.retry'))}</button>
        </div>`;
      listEl.querySelector('[data-retry]')?.addEventListener('click', () => {
        listEl.innerHTML = skeletonRows(4);
        load();
      });
    }
  }

  root.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      render();
    });
  });

  function scheduleStoryRefresh() {
    if (disposed) return;
    storyTimer = setTimeout(async () => {
      await refreshStories();
      scheduleStoryRefresh();
    }, 30000);
  }

  refreshStories();
  load();
  scheduleStoryRefresh();

  return () => {
    disposed = true;
    if (storyTimer) clearTimeout(storyTimer);
  };
}
