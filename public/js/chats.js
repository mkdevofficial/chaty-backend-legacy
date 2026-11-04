import { state } from './state.js';
import { apiGet } from './api.js';
import { t, errorText } from './i18n.js';
import {
  icon,
  escapeHtml,
  avatarHtml,
  formatChatTime,
  skeletonRows,
  messagePreview,
  showError,
  formatTime,
} from './ui.js';
import { navigate } from './router.js';
import { loadStoryGroups, renderStoriesStrip } from './stories.js';

export function renderChats(root) {
  let disposed = false;
  let timer = null;
  let storiesEl = null;

  root.innerHTML = `
    <section class="screen">
      <header class="topbar">
        <div class="brand-mark">${icon('messageCircle', 21)}</div>
        <div class="grow">
          <h1>${escapeHtml(t('chats.title'))}</h1>
          <span class="topbar-subtitle">${escapeHtml(t('chats.subtitle'))}</span>
        </div>
        <button type="button" class="icon-btn soft" data-find aria-label="${escapeHtml(t('search.title'))}">${icon('search', 21)}</button>
      </header>
      <div class="screen-body">
        <div class="stories-strip" data-stories></div>
        <div data-conversations>
          ${skeletonRows(5)}
        </div>
      </div>
    </section>`;

  storiesEl = root.querySelector('[data-stories]');
  const listEl = root.querySelector('[data-conversations]');
  root.querySelector('[data-find]').addEventListener('click', () => navigate('search'));

  const onStoriesChanged = async () => {
    if (disposed) return;
    try {
      const groups = await loadStoryGroups();
      renderStoriesStrip(storiesEl, groups, { onChanged: onStoriesChanged });
    } catch (error) {
      console.error(error);
    }
  };

  async function refreshStories() {
    try {
      const groups = await loadStoryGroups();
      if (disposed) return;
      renderStoriesStrip(storiesEl, groups, { onChanged: onStoriesChanged });
    } catch {
      if (!disposed) {
        storiesEl.innerHTML = '';
      }
    }
  }

  function renderList() {
    const conversations = state.conversations;
    state.unreadTotal = conversations.reduce((sum, item) => sum + (Number(item.unread) || 0), 0);
    import('./router.js').then(({ updateNav }) => updateNav());
    if (!conversations.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-art">${icon('messageCircle', 38)}</div>
          <h3>${escapeHtml(t('chats.emptyTitle'))}</h3>
          <p>${escapeHtml(t('chats.emptyText'))}</p>
          <button type="button" class="btn btn-primary mt-8" data-empty-search>${icon('search', 18)} ${escapeHtml(t('chats.findFriends'))}</button>
        </div>`;
      listEl.querySelector('[data-empty-search]')?.addEventListener('click', () => navigate('search'));
      return;
    }
    listEl.innerHTML = `<div class="list">${conversations.map((conversation) => {
      const peer = conversation.peer;
      const last = conversation.last_message;
      const preview = conversation.typing
        ? `<span class="typing-text">${escapeHtml(t('chat.typing'))}</span>`
        : `<span class="preview">${escapeHtml(messagePreview(last))}</span>`;
      const time = last ? formatChatTime(last.created_at) : '';
      return `
        <button type="button" class="list-row chat-row ${conversation.unread ? 'unread' : ''}" data-conversation="${conversation.id}">
          ${avatarHtml(peer, { size: 50, status: true })}
          <span class="row-main">
            <span class="row-title"><span class="name">${escapeHtml(peer.display_name)}</span></span>
            <span class="row-sub">${preview}</span>
          </span>
          <span class="row-meta">
            <span>${escapeHtml(time)}</span>
            ${conversation.unread ? `<span class="unread-pill">${conversation.unread > 99 ? '99+' : conversation.unread}</span>` : ''}
          </span>
        </button>`;
    }).join('')}</div>`;
    listEl.querySelectorAll('[data-conversation]').forEach((row) => {
      row.addEventListener('click', () => navigate('chat', { id: Number(row.dataset.conversation) }));
    });
  }

  async function refreshConversations(silent = false) {
    try {
      const data = await apiGet('conversations', 'list');
      if (disposed) return;
      state.conversations = data.conversations || [];
      const body = root.querySelector('.screen-body');
      const scroll = body ? body.scrollTop : 0;
      renderList();
      if (body) body.scrollTop = scroll;
    } catch (error) {
      if (!silent && !disposed) {
        if (!state.conversations.length) {
          listEl.innerHTML = `
            <div class="empty-state">
              <div class="empty-art">${icon('info', 38)}</div>
              <h3>${escapeHtml(t('common.error'))}</h3>
              <p>${escapeHtml(errorText(error))}</p>
              <button type="button" class="btn btn-ghost mt-8" data-retry>${icon('refresh', 18)} ${escapeHtml(t('common.retry'))}</button>
            </div>`;
          listEl.querySelector('[data-retry]')?.addEventListener('click', () => {
            listEl.innerHTML = skeletonRows(4);
            refreshConversations();
          });
        } else {
          showError(error);
        }
      }
    }
  }

  async function pollLoop() {
    if (disposed) return;
    await refreshConversations(true);
    if (disposed) return;
    timer = setTimeout(pollLoop, document.hidden ? 30000 : 8000);
  }

  const onVisibility = () => {
    if (disposed || document.hidden) return;
    refreshConversations(true);
  };

  document.addEventListener('visibilitychange', onVisibility);
  refreshStories();
  refreshConversations().then(() => {
    renderList();
    timer = setTimeout(pollLoop, document.hidden ? 30000 : 8000);
  });

  state.refreshChats = () => refreshConversations(true);

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    if (state.refreshChats) state.refreshChats = null;
  };
}
