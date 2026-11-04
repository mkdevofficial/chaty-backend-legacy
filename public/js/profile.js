import { state, setUser, updatePrefs, clearSessionState } from './state.js';
import { apiGet, apiPost, apiUpload } from './api.js';
import { t, errorText } from './i18n.js';
import { applyVisuals } from './theme.js';
import {
  icon,
  escapeHtml,
  avatarHtml,
  modal,
  confirmDialog,
  toast,
  showError,
  formatDate,
} from './ui.js';
import { navigate, goBack, refreshRoute } from './router.js';
import { pickFile, squareImage } from './media.js';
import { openConversationWithUser, setFollowing } from './actions.js';

function phoneLabel(phone) {
  return phone || '';
}

async function saveSettings(patch, { refresh = false } = {}) {
  const next = {
    lang: state.lang,
    theme: state.theme,
    accent: state.accent,
    wallpaper: state.wallpaper,
    ...patch,
  };
  applyVisuals(next);
  try {
    const data = await apiPost('auth', 'settings', next);
    state.user = { ...state.user, ...data.user };
    setUser(state.user);
  } catch (error) {
    showError(error);
  }
  if (refresh) await refreshRoute();
}

function updateOwnHero(root, user) {
  const avatarMount = root.querySelector('[data-hero-avatar]');
  const nameEl = root.querySelector('[data-hero-name]');
  const handleEl = root.querySelector('[data-hero-handle]');
  const bioEl = root.querySelector('[data-hero-bio]');
  if (avatarMount) avatarMount.innerHTML = avatarHtml(user, { size: 96 });
  if (nameEl) nameEl.textContent = user.display_name;
  if (handleEl) handleEl.textContent = `@${user.username}`;
  if (bioEl) bioEl.textContent = user.bio || '';
}

function openEditProfile(root, onChanged) {
  const user = state.user;
  let avatarUser = user;

  const dlg = modal({
    title: t('profile.editProfile'),
    body: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:14px">
        <div data-edit-avatar>${avatarHtml(avatarUser, { size: 84 })}</div>
        <div style="display:flex;gap:6px">
          <button type="button" class="mini-btn accent" data-change-avatar>${icon('camera', 15)} ${escapeHtml(t('profile.changePhoto'))}</button>
          ${avatarUser.avatar_url ? `<button type="button" class="mini-btn" data-remove-avatar>${icon('trash', 15)} ${escapeHtml(t('profile.removePhoto'))}</button>` : ''}
        </div>
        <span class="faint" style="font-size:10px;text-align:center">${escapeHtml(t('profile.photoHint'))}</span>
      </div>
      <div class="field">
        <label for="edit-display">${escapeHtml(t('profile.displayName'))}</label>
        <input id="edit-display" maxlength="50" value="${escapeHtml(user.display_name)}">
      </div>
      <div class="field">
        <label for="edit-username">${escapeHtml(t('profile.username'))}</label>
        <input id="edit-username" maxlength="20" value="${escapeHtml(user.username)}" autocapitalize="none" spellcheck="false">
        <span class="hint">${escapeHtml(t('auth.usernameHint'))}</span>
      </div>
      <div class="field">
        <label for="edit-bio">${escapeHtml(t('profile.bio'))}</label>
        <textarea id="edit-bio" maxlength="150" placeholder="${escapeHtml(t('profile.bioPlaceholder'))}">${escapeHtml(user.bio || '')}</textarea>
        <span class="counter"><span data-bio-count>${(user.bio || '').length}</span>/150</span>
      </div>`,
    actions: [
      { label: t('common.cancel'), className: 'btn-ghost' },
      {
        label: t('common.save'),
        className: 'btn-primary',
        onClick: async ({ sheet }) => {
          try {
            const display = sheet.querySelector('#edit-display').value.trim();
            const username = sheet.querySelector('#edit-username').value.trim();
            const bio = sheet.querySelector('#edit-bio').value.trim();
            const data = await apiPost('auth', 'update_profile', {
              display_name: display,
              username,
              bio,
            });
            state.user = data.user;
            setUser(data.user);
            toast(t('profile.saved'), 'success');
            onChanged();
            return true;
          } catch (error) {
            showError(error);
            return false;
          }
        },
      },
    ],
    onMount: ({ sheet }) => {
      const bio = sheet.querySelector('#edit-bio');
      const counter = sheet.querySelector('[data-bio-count]');
      bio.addEventListener('input', () => { counter.textContent = String(bio.value.length); });

      sheet.querySelector('[data-change-avatar]').addEventListener('click', async () => {
        const file = await pickFile('image/*');
        if (!file) return;
        if (file.size > state.limits.image) {
          toast(t('errors.upload_too_large'), 'error');
          return;
        }
        try {
          toast(t('profile.avatarUploading'), 'info', 4000);
          const square = await squareImage(file, 512);
          const attachment = await apiUpload(square);
          const data = await apiPost('auth', 'avatar', { attachment_id: attachment.id });
          state.user = data.user;
          setUser(data.user);
          avatarUser = data.user;
          const mount = sheet.querySelector('[data-edit-avatar]');
          mount.innerHTML = avatarHtml(avatarUser, { size: 84 });
          toast(t('profile.avatarUpdated'), 'success');
          onChanged();
        } catch (error) {
          showError(error);
        }
      });

      const remove = sheet.querySelector('[data-remove-avatar]');
      if (remove) remove.addEventListener('click', async () => {
        try {
          const data = await apiPost('auth', 'remove_avatar', {});
          state.user = data.user;
          setUser(data.user);
          avatarUser = data.user;
          sheet.querySelector('[data-edit-avatar]').innerHTML = avatarHtml(avatarUser, { size: 84 });
          remove.remove();
          onChanged();
        } catch (error) {
          showError(error);
        }
      });
    },
  });
  return dlg;
}

export async function renderProfile(root) {
  let disposed = false;
  let stats = { following: 0, followers: 0, stories: 0 };

  root.innerHTML = `
    <section class="screen">
      <header class="topbar">
        <div class="brand-mark">${icon('user', 21)}</div>
        <div class="grow">
          <h1>${escapeHtml(t('profile.title'))}</h1>
          <span class="topbar-subtitle">@${escapeHtml(state.user.username)}</span>
        </div>
        <button type="button" class="icon-btn soft" data-edit aria-label="${escapeHtml(t('profile.edit'))}">${icon('edit', 20)}</button>
      </header>
      <div class="screen-body">
        <div class="profile-hero">
          <div data-hero-avatar>${avatarHtml(state.user, { size: 96 })}</div>
          <h2 data-hero-name>${escapeHtml(state.user.display_name)}</h2>
          <div class="profile-handle" data-hero-handle>@${escapeHtml(state.user.username)}</div>
          <p class="profile-bio" data-hero-bio>${escapeHtml(state.user.bio || '')}</p>
          <div class="profile-stats">
            <div class="stat"><strong data-stat-following>${stats.following}</strong><span>${escapeHtml(t('profile.following'))}</span></div>
            <div class="stat"><strong data-stat-followers>${stats.followers}</strong><span>${escapeHtml(t('profile.followers'))}</span></div>
            <div class="stat"><strong data-stat-stories>${stats.stories}</strong><span>${escapeHtml(t('profile.stories'))}</span></div>
          </div>
          <div class="profile-actions">
            <button type="button" class="btn btn-primary" data-edit-2>${icon('edit', 17)} ${escapeHtml(t('profile.editProfile'))}</button>
            <button type="button" class="btn btn-ghost" data-logout>${icon('logout', 17)} ${escapeHtml(t('profile.logout'))}</button>
          </div>
        </div>

        <div class="settings-title">${escapeHtml(t('settings.appearance'))}</div>
        <div class="settings-group">
          <div class="settings-row">
            <span class="setting-icon">${icon('moon', 19)}</span>
            <span class="setting-main">
              <span class="setting-label">${escapeHtml(t('settings.theme'))}</span>
            </span>
            <div class="segmented">
              <button type="button" data-theme="dark" class="${state.theme === 'dark' ? 'active' : ''}">${escapeHtml(t('profile.dark'))}</button>
              <button type="button" data-theme="light" class="${state.theme === 'light' ? 'active' : ''}">${escapeHtml(t('profile.light'))}</button>
            </div>
          </div>
          <div class="settings-row">
            <span class="setting-icon">${icon('palette', 19)}</span>
            <span class="setting-main"><span class="setting-label">${escapeHtml(t('settings.accent'))}</span></span>
            <div class="accent-swatches">
              ${['teal', 'violet', 'rose', 'amber'].map((accent) => `<button type="button" class="swatch ${accent} ${state.accent === accent ? 'active' : ''}" data-accent="${accent}" aria-label="${accent}"></button>`).join('')}
            </div>
          </div>
          <div class="settings-row" style="flex-wrap:wrap">
            <span class="setting-icon">${icon('wallpaper', 19)}</span>
            <span class="setting-main"><span class="setting-label">${escapeHtml(t('settings.wallpaper'))}</span></span>
          </div>
          <div class="wallpaper-options">
            ${[
              ['default', 'settings.wallpaperDefault'],
              ['dots', 'settings.wallpaperDots'],
              ['waves', 'settings.wallpaperWaves'],
              ['paper', 'settings.wallpaperPaper'],
            ].map(([value, key]) => `<button type="button" class="wallpaper-option ${state.wallpaper === value ? 'active' : ''}" data-wallpaper="${value}"><span>${escapeHtml(t(key))}</span></button>`).join('')}
          </div>
          <div class="settings-row">
            <span class="setting-icon">${icon('globe', 19)}</span>
            <span class="setting-main"><span class="setting-label">${escapeHtml(t('settings.language'))}</span></span>
            <div class="segmented">
              <button type="button" data-lang="ar" class="${state.lang === 'ar' ? 'active' : ''}">${escapeHtml(t('profile.arabic'))}</button>
              <button type="button" data-lang="en" class="${state.lang === 'en' ? 'active' : ''}">English</button>
            </div>
          </div>
        </div>

        <div class="settings-title">${escapeHtml(t('settings.account'))}</div>
        <div class="settings-group">
          <div class="settings-row">
            <span class="setting-icon">${icon('phone', 19)}</span>
            <span class="setting-main">
              <span class="setting-label">${escapeHtml(t('profile.phoneLabel'))}</span>
              <span class="setting-desc">${escapeHtml(phoneLabel(state.user.phone))}</span>
            </span>
          </div>
          <div class="settings-row">
            <span class="setting-icon">${icon('info', 19)}</span>
            <span class="setting-main">
              <span class="setting-label">${escapeHtml(t('settings.version'))}</span>
              <span class="setting-desc">${escapeHtml(t('settings.offlineReady'))}</span>
            </span>
          </div>
        </div>
        <div class="danger-zone">
          <button type="button" class="btn btn-danger btn-block" data-logout-2>${icon('logout', 18)} ${escapeHtml(t('profile.logout'))}</button>
        </div>
      </div>
    </section>`;

  const onChanged = async () => {
    updateOwnHero(root, state.user);
    await loadStats();
  };

  const edit = () => openEditProfile(root, onChanged);
  root.querySelector('[data-edit]').addEventListener('click', edit);
  root.querySelector('[data-edit-2]').addEventListener('click', edit);

  async function loadStats() {
    try {
      const data = await apiGet('users', 'profile', { id: state.user.id });
      if (disposed) return;
      stats = data.stats;
      state.user = { ...state.user, ...data.user };
      const followingEl = root.querySelector('[data-stat-following]');
      const followersEl = root.querySelector('[data-stat-followers]');
      const storiesEl = root.querySelector('[data-stat-stories]');
      if (followingEl) followingEl.textContent = String(stats.following);
      if (followersEl) followersEl.textContent = String(stats.followers);
      if (storiesEl) storiesEl.textContent = String(stats.stories);
    } catch {
      /* non-critical stats */
    }
  }

  async function logout() {
    const confirmed = await confirmDialog(t('profile.logoutConfirm'), t('profile.logoutConfirmText'), t('profile.logout'));
    if (!confirmed) return;
    try {
      await apiPost('auth', 'logout', {});
      clearSessionState();
      document.dispatchEvent(new CustomEvent('chaty:logout'));
    } catch (error) {
      showError(error);
    }
  }
  root.querySelector('[data-logout]').addEventListener('click', logout);
  root.querySelector('[data-logout-2]').addEventListener('click', logout);

  root.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-theme]').forEach((item) => item.classList.toggle('active', item === btn));
      saveSettings({ theme: btn.dataset.theme });
    });
  });
  root.querySelectorAll('[data-accent]').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-accent]').forEach((item) => item.classList.toggle('active', item === btn));
      saveSettings({ accent: btn.dataset.accent });
    });
  });
  root.querySelectorAll('[data-wallpaper]').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-wallpaper]').forEach((item) => item.classList.toggle('active', item === btn));
      saveSettings({ wallpaper: btn.dataset.wallpaper });
    });
  });
  root.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.lang === state.lang) return;
      saveSettings({ lang: btn.dataset.lang }, { refresh: true });
    });
  });

  loadStats();

  return () => { disposed = true; };
}

export async function renderUser(root, params) {
  let disposed = false;
  let profile = null;
  let relationship = null;

  root.innerHTML = `
    <section class="screen">
      <header class="topbar">
        <button type="button" class="icon-btn" data-back aria-label="${escapeHtml(t('common.back'))}">${icon('back', 22)}</button>
        <div class="grow"><h1>${escapeHtml(t('profile.title'))}</h1></div>
      </header>
      <div class="screen-body">
        <div style="display:grid;place-items:center;padding:40px"><div class="loader"></div></div>
      </div>
    </section>`;
  const body = root.querySelector('.screen-body');
  root.querySelector('[data-back]').addEventListener('click', () => goBack());

  function renderProfile() {
    const user = profile.user;
    const isSelf = relationship.is_self;
    const tags = [
      relationship.is_self ? t('profile.myProfile') : '',
      relationship.is_following ? t('profile.youFollow') : '',
      relationship.follows_me ? t('profile.followsYou') : '',
    ].filter(Boolean);
    body.innerHTML = `
      <div class="profile-hero">
        <div>${avatarHtml(user, { size: 96, status: true })}</div>
        <h2>${escapeHtml(user.display_name)}</h2>
        <div class="profile-handle">@${escapeHtml(user.username)}</div>
        ${tags.length ? `<div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-top:6px">${tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        <p class="profile-bio">${escapeHtml(user.bio || '')}</p>
        <div class="profile-stats">
          <div class="stat"><strong>${profile.stats.following}</strong><span>${escapeHtml(t('profile.following'))}</span></div>
          <div class="stat"><strong>${profile.stats.followers}</strong><span>${escapeHtml(t('profile.followers'))}</span></div>
          <div class="stat"><strong>${profile.stats.stories}</strong><span>${escapeHtml(t('profile.stories'))}</span></div>
        </div>
        <div class="profile-actions">
          ${isSelf ? `<button type="button" class="btn btn-primary" data-open-self>${icon('user', 17)} ${escapeHtml(t('profile.myProfile'))}</button>` : `
            <button type="button" class="btn ${relationship.is_following ? 'btn-ghost' : 'btn-primary'}" data-follow>${icon(relationship.is_following ? 'minus' : 'plus', 17)} ${escapeHtml(relationship.is_following ? t('profile.removeFriend') : t('profile.addFriend'))}</button>
            <button type="button" class="btn btn-soft" data-message>${icon('messageCircle', 17)} ${escapeHtml(t('profile.openChat'))}</button>`}
        </div>
        <div class="faint" style="font-size:10.5px;margin-top:12px">${escapeHtml(t('profile.joined', { date: formatDate(user.created_at) }))}</div>
      </div>`;

    body.querySelector('[data-back]')?.addEventListener('click', () => goBack());
    const followBtn = body.querySelector('[data-follow]');
    if (followBtn) followBtn.addEventListener('click', async () => {
      followBtn.disabled = true;
      const result = await setFollowing(user.id, !relationship.is_following);
      if (result) {
        relationship.is_following = !relationship.is_following;
        relationship.follows_me = Boolean(result.follows_me);
        relationship.is_friend = relationship.is_following || relationship.follows_me;
        if (relationship.is_following) profile.stats.followers = Number(profile.stats.followers) + 1;
        else profile.stats.followers = Math.max(0, Number(profile.stats.followers) - 1);
        renderProfile();
      } else {
        followBtn.disabled = false;
      }
    });
    body.querySelector('[data-message]')?.addEventListener('click', () => openConversationWithUser(user.id));
    body.querySelector('[data-open-self]')?.addEventListener('click', () => navigate('profile'));
  }

  try {
    profile = await apiGet('users', 'profile', { id: Number(params.id) });
    if (disposed) return;
    relationship = profile.relationship;
    if (relationship.is_self) {
      navigate('profile', {}, { replace: true, noPush: true });
      return;
    }
    renderProfile();
  } catch (error) {
    if (disposed) return;
    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-art">${icon('user', 36)}</div>
        <h3>${escapeHtml(t('profile.notFound'))}</h3>
        <p>${escapeHtml(errorText(error))}</p>
        <button type="button" class="btn btn-ghost mt-8" data-back2>${icon('back', 18)} ${escapeHtml(t('common.back'))}</button>
      </div>`;
    body.querySelector('[data-back2]')?.addEventListener('click', () => goBack());
  }

  return () => { disposed = true; };
}
