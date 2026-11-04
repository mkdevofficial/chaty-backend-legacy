import { state } from './state.js';
import { apiGet, apiPost, apiUpload, attachmentUrl } from './api.js';
import { t, errorText } from './i18n.js';
import {
  icon,
  escapeHtml,
  avatarHtml,
  modal,
  confirmDialog,
  toast,
  showError,
  formatRelative,
  formatTime,
  formatDate,
  el,
} from './ui.js';
import { pickFile, resizeImage } from './media.js';

const STORY_BACKGROUNDS = ['#0f766e', '#7c3aed', '#be123c', '#b45309', '#1d4ed8', '#15803d', '#0f172a', '#475569', '#db2777', '#0e7490'];
const STORY_DURATION = 5200;

export async function loadStoryGroups() {
  const data = await apiGet('stories', 'list');
  state.storyGroups = data.groups || [];
  return state.storyGroups;
}

export function renderStoriesStrip(container, groups, { onChanged } = {}) {
  const own = groups.find((group) => group.is_self);
  const others = groups.filter((group) => !group.is_self);
  const ownHasStories = Boolean(own && own.stories.length);

  container.innerHTML = `
    <div class="story-chip-wrap">
      <button type="button" class="story-chip" data-own="1">
        <span class="avatar-ring ${ownHasStories && !own.has_unseen ? 'seen' : ''}">
          ${avatarHtml(state.user, { size: 52 })}
        </span>
        <span class="name">${escapeHtml(t('stories.yourStory'))}</span>
      </button>
      <button type="button" class="add-bubble" data-add-story aria-label="${escapeHtml(t('stories.add'))}">${icon('plus', 13)}</button>
    </div>
    ${others.map((group, index) => `
      <button type="button" class="story-chip" data-group="${index}">
        <span class="avatar-ring ${group.has_unseen ? '' : 'seen'}">
          ${avatarHtml(group.user, { size: 52 })}
        </span>
        <span class="name">${escapeHtml(group.user.display_name)}</span>
      </button>`).join('')}`;

  const openGroup = (realIndex) => {
    const ordered = [own, ...others].filter(Boolean);
    const start = realIndex === -1 ? 0 : ordered.findIndex((group) => group === others[realIndex]);
    openStoryViewer(ordered, start < 0 ? 0 : start, { onChanged });
  };

  container.querySelector('[data-own]').addEventListener('click', () => {
    if (ownHasStories) openGroup(-1);
    else openStoryComposer({ onPublished: onChanged });
  });
  container.querySelector('[data-add-story]').addEventListener('click', (event) => {
    event.stopPropagation();
    openStoryComposer({ onPublished: onChanged });
  });
  container.querySelectorAll('[data-group]').forEach((btn) => {
    btn.addEventListener('click', () => openGroup(Number(btn.dataset.group)));
  });
}

export async function refreshStoriesStrip(container, options = {}) {
  try {
    const groups = await loadStoryGroups();
    renderStoriesStrip(container, groups, options);
    return groups;
  } catch (error) {
    showError(error);
    return [];
  }
}

export function openStoryComposer({ onPublished } = {}) {
  let mode = 'text';
  let background = STORY_BACKGROUNDS[0];
  let imageFile = null;
  let previewUrl = null;

  const actions = [
    { label: t('common.cancel'), className: 'btn-ghost' },
    {
      label: t('stories.publish'),
      className: 'btn-primary',
      onClick: async ({ sheet, close }) => {
        const publishBtn = sheet.querySelector('.modal-actions .btn-primary');
        const original = publishBtn.innerHTML;
        try {
          if (mode === 'text') {
            const text = sheet.querySelector('#story-text').value.trim();
            if (!text) {
              toast(t('errors.empty_story'), 'error');
              return false;
            }
            publishBtn.disabled = true;
            publishBtn.textContent = t('stories.uploading');
            await apiPost('stories', 'create', { kind: 'text', caption: text, background });
          } else {
            if (!imageFile) {
              toast(t('stories.choosePhoto'), 'error');
              return false;
            }
            const caption = sheet.querySelector('#story-caption').value.trim();
            publishBtn.disabled = true;
            publishBtn.textContent = t('stories.uploading');
            const attachment = await apiUpload(imageFile);
            await apiPost('stories', 'create', {
              kind: 'image',
              attachment_id: attachment.id,
              caption,
              background,
            });
          }
          toast(t('stories.published'), 'success');
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          close();
          if (onPublished) await onPublished();
          return false;
        } catch (error) {
          showError(error);
          publishBtn.innerHTML = original;
          publishBtn.disabled = false;
          return false;
        }
      },
    },
  ];

  const dlg = modal({
    title: t('stories.addStory'),
    body: `
      <div class="segmented" style="margin-bottom:14px">
        <button type="button" data-story-mode="text" class="active" style="flex:1">${escapeHtml(t('stories.textStory'))}</button>
        <button type="button" data-story-mode="image" style="flex:1">${escapeHtml(t('stories.photoStory'))}</button>
      </div>
      <div data-panel="text">
        <div id="story-text-preview" class="story-preview-text" style="background:${background};color:#fff;margin-bottom:12px">${escapeHtml(t('stories.captionPlaceholder'))}</div>
        <div class="field">
          <label for="story-text">${escapeHtml(t('stories.caption'))}</label>
          <textarea id="story-text" maxlength="300" placeholder="${escapeHtml(t('stories.captionPlaceholder'))}"></textarea>
          <span class="counter"><span data-counter>0</span>/300</span>
        </div>
        <div class="field">
          <label>${escapeHtml(t('stories.background'))}</label>
          <div class="story-compose-bg">
            ${STORY_BACKGROUNDS.map((color) => `<button type="button" class="story-bg-swatch ${color === background ? 'active' : ''}" data-bg="${color}" style="background:${color}" aria-label="${color}"></button>`).join('')}
          </div>
        </div>
      </div>
      <div data-panel="image" class="hidden">
        <button type="button" class="btn btn-ghost btn-block" id="story-choose-image">${icon('image', 18)} ${escapeHtml(t('stories.choosePhoto'))}</button>
        <div id="story-image-preview" class="hidden" style="margin-top:12px;border-radius:14px;overflow:hidden;max-height:280px;display:grid;place-items:center;background:var(--surface-2)">
        </div>
        <div class="field mt-14">
          <label for="story-caption">${escapeHtml(t('stories.caption'))}</label>
          <input id="story-caption" maxlength="300" placeholder="${escapeHtml(t('stories.imageCaptionPlaceholder'))}">
        </div>
      </div>`,
    actions,
    onMount: ({ sheet }) => {
      const textPanel = sheet.querySelector('[data-panel="text"]');
      const imagePanel = sheet.querySelector('[data-panel="image"]');
      const textInput = sheet.querySelector('#story-text');
      const preview = sheet.querySelector('#story-text-preview');
      const counter = sheet.querySelector('[data-counter]');

      const setMode = (next) => {
        mode = next;
        sheet.querySelectorAll('[data-story-mode]').forEach((btn) => btn.classList.toggle('active', btn.dataset.storyMode === mode));
        textPanel.classList.toggle('hidden', mode !== 'text');
        imagePanel.classList.toggle('hidden', mode !== 'image');
      };

      sheet.querySelectorAll('[data-story-mode]').forEach((btn) => {
        btn.addEventListener('click', () => setMode(btn.dataset.storyMode));
      });

      textInput.addEventListener('input', () => {
        const value = textInput.value.trim();
        preview.textContent = value || t('stories.captionPlaceholder');
        counter.textContent = String(textInput.value.length);
      });

      sheet.querySelectorAll('[data-bg]').forEach((btn) => {
        btn.addEventListener('click', () => {
          background = btn.dataset.bg;
          sheet.querySelectorAll('[data-bg]').forEach((swatch) => swatch.classList.toggle('active', swatch.dataset.bg === background));
          preview.style.background = background;
        });
      });

      sheet.querySelector('#story-choose-image').addEventListener('click', async () => {
        const picked = await pickFile('image/*');
        if (!picked) return;
        if (picked.size > state.limits.image) {
          toast(t('errors.upload_too_large'), 'error');
          return;
        }
        try {
          imageFile = await resizeImage(picked, 1600);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          previewUrl = URL.createObjectURL(imageFile);
          const box = sheet.querySelector('#story-image-preview');
          box.innerHTML = `<img src="${previewUrl}" alt="" style="width:100%;max-height:280px;object-fit:contain">`;
          box.classList.remove('hidden');
          setMode('image');
        } catch {
          toast(t('chat.imageFailed'), 'error');
        }
      });
    },
  });

  return dlg;
}

export function openStoryViewer(groups, startGroupIndex = 0, { onChanged } = {}) {
  if (!groups || !groups.length) {
    if (onChanged) onChanged();
    return;
  }
  let groupIndex = Math.max(0, Math.min(startGroupIndex, groups.length - 1));
  if (!groups[groupIndex] || !groups[groupIndex].stories.length) {
    groupIndex = Math.max(0, groups.findIndex((group) => group.stories.length));
  }
  let storyIndex = 0;
  let paused = false;
  let closed = false;
  let elapsed = 0;
  let lastFrame = 0;
  let raf = null;
  const viewed = new Set();
  let pointer = null;
  let swiping = false;

  const root = el(`
    <div class="story-viewer" role="dialog" aria-modal="true">
      <div class="story-progress"></div>
      <div class="story-head"></div>
      <div class="story-stage"></div>
      <div class="story-footer"></div>
    </div>`);
  const progressEl = root.querySelector('.story-progress');
  const headEl = root.querySelector('.story-head');
  const stageEl = root.querySelector('.story-stage');
  const footerEl = root.querySelector('.story-footer');
  document.getElementById('overlay-root').appendChild(root);

  function cleanup() {
    closed = true;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    document.removeEventListener('keydown', onKey);
    root.remove();
  }

  function close(animated = true) {
    if (closed) return;
    closed = true;
    if (animated) {
      root.style.transform = 'translateY(100%)';
      root.style.opacity = '0';
      setTimeout(() => {
        cleanup();
        if (onChanged) onChanged();
      }, 170);
    } else {
      cleanup();
      if (onChanged) onChanged();
    }
  }

  function onKey(event) {
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowRight') next();
    if (event.key === 'ArrowLeft') prev();
  }

  function activeGroup() {
    return groups[groupIndex];
  }

  function activeStory() {
    return activeGroup()?.stories[storyIndex];
  }

  function markSeen() {
    const story = activeStory();
    if (!story || viewed.has(story.id)) return;
    viewed.add(story.id);
    story.seen = true;
    const group = activeGroup();
    if (group) group.has_unseen = group.stories.some((item) => !item.seen);
    apiPost('stories', 'view', { story_id: story.id }).catch(() => {});
  }

  function stopTicker() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function tick(now) {
    if (closed || paused) return;
    if (!lastFrame) lastFrame = now;
    elapsed += now - lastFrame;
    lastFrame = now;
    const bar = progressEl.querySelector('.bar.active i');
    if (bar) bar.style.width = `${Math.min(100, (elapsed / STORY_DURATION) * 100)}%`;
    if (elapsed >= STORY_DURATION) {
      next();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function startTicker() {
    stopTicker();
    lastFrame = 0;
    if (!paused) raf = requestAnimationFrame(tick);
  }

  function setPaused(value) {
    paused = value;
    if (paused) stopTicker();
    else startTicker();
  }

  function renderProgress() {
    const group = activeGroup();
    if (!group) return;
    progressEl.innerHTML = group.stories.map((_, index) => {
      const stateClass = index < storyIndex ? 'done' : index === storyIndex ? 'active' : '';
      return `<div class="bar ${stateClass}"><i style="${index < storyIndex ? 'width:100%' : 'width:0'}"></i></div>`;
    }).join('');
  }

  function renderHead() {
    const group = activeGroup();
    const story = activeStory();
    if (!group || !story) return;
    headEl.innerHTML = `
      ${avatarHtml(group.user, { size: 36 })}
      <div>
        <div class="story-name">${escapeHtml(group.is_self ? t('stories.yours') : group.user.display_name)}</div>
        <div class="story-time">${escapeHtml(formatRelative(story.created_at))}</div>
      </div>
      <div class="story-head-actions">
        ${group.is_self ? `
          <button type="button" class="icon-btn" data-viewers aria-label="${escapeHtml(t('stories.viewers'))}">${icon('eye', 20)}</button>
          <button type="button" class="icon-btn" data-delete aria-label="${escapeHtml(t('common.delete'))}">${icon('trash', 19)}</button>` : ''}
        <button type="button" class="icon-btn" data-close aria-label="${escapeHtml(t('common.close'))}">${icon('close', 21)}</button>
      </div>`;
    headEl.querySelector('[data-close]').addEventListener('click', () => close());
    const viewersBtn = headEl.querySelector('[data-viewers]');
    if (viewersBtn) viewersBtn.addEventListener('click', () => showViewers(story.id));
    const deleteBtn = headEl.querySelector('[data-delete]');
    if (deleteBtn) deleteBtn.addEventListener('click', () => deleteCurrent(story.id));
  }

  function renderStage() {
    const group = activeGroup();
    const story = activeStory();
    if (!group || !story) return;
    if (story.kind === 'image' && story.attachment) {
      stageEl.innerHTML = `
        <img src="${attachmentUrl(story.attachment)}" alt="">
        ${story.caption ? `<div class="story-caption">${escapeHtml(story.caption)}</div>` : ''}`;
    } else {
      stageEl.innerHTML = `
        <div class="story-text-card" style="background:${escapeHtml(story.background || '#0f766e')}">
          <div class="text">${escapeHtml(story.caption)}</div>
        </div>`;
    }
  }

  function renderFooter() {
    const group = activeGroup();
    const story = activeStory();
    if (!group || !story) return;
    footerEl.innerHTML = group.is_self
      ? `<button type="button" class="btn btn-sm" data-footer-viewers style="background:rgba(255,255,255,.16);color:#fff">${icon('eye', 17)} ${escapeHtml(t('stories.viewers'))}</button>
         <span class="view-count">${escapeHtml(formatTime(story.created_at))}</span>`
      : `<span class="view-count">${escapeHtml(t('stories.tapHint'))}</span>`;
    const btn = footerEl.querySelector('[data-footer-viewers]');
    if (btn) btn.addEventListener('click', () => showViewers(story.id));
  }

  function render() {
    const group = activeGroup();
    if (!group || !group.stories.length) {
      close(false);
      return;
    }
    storyIndex = Math.max(0, Math.min(storyIndex, group.stories.length - 1));
    elapsed = 0;
    renderProgress();
    renderHead();
    renderStage();
    renderFooter();
    markSeen();
    startTicker();
  }

  function next() {
    const group = activeGroup();
    if (storyIndex < group.stories.length - 1) {
      storyIndex += 1;
      render();
      return;
    }
    if (groupIndex < groups.length - 1) {
      groupIndex += 1;
      storyIndex = 0;
      render();
      return;
    }
    close();
  }

  function prev() {
    const group = activeGroup();
    if (storyIndex > 0) {
      storyIndex -= 1;
      render();
      return;
    }
    if (groupIndex > 0) {
      groupIndex -= 1;
      storyIndex = Math.max(0, activeGroup().stories.length - 1);
      render();
      return;
    }
    render();
  }

  function showViewers(storyId) {
    setPaused(true);
    modal({
      title: t('stories.viewers'),
      body: '<div class="loader" style="margin:20px auto"></div>',
      actions: [{ label: t('common.close'), className: 'btn-ghost' }],
      onClose: () => setPaused(false),
      onMount: async ({ body }) => {
        try {
          const data = await apiGet('stories', 'viewers', { story_id: storyId });
          if (!data.viewers.length) {
            body.innerHTML = `<div class="empty-state" style="min-height:120px"><p>${escapeHtml(t('stories.noViewers'))}</p></div>`;
            return;
          }
          body.innerHTML = data.viewers.map((viewer) => `
            <div class="story-seen-row">
              ${avatarHtml(viewer, { size: 38 })}
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(viewer.display_name)}</div>
                <div class="faint" style="font-size:10.5px">@${escapeHtml(viewer.username)}</div>
              </div>
              <span class="faint" style="font-size:10px">${escapeHtml(formatRelative(viewer.viewed_at))}</span>
            </div>`).join('');
        } catch (error) {
          showError(error);
          body.innerHTML = `<p class="muted">${escapeHtml(errorText(error))}</p>`;
        }
      },
    });
  }

  async function deleteCurrent(storyId) {
    const confirmed = await confirmDialog(t('stories.deleteConfirmTitle'), t('stories.deleteConfirmText'), t('common.delete'));
    if (!confirmed) {
      setPaused(false);
      return;
    }
    setPaused(true);
    try {
      await apiPost('stories', 'delete', { story_id: storyId });
      const group = activeGroup();
      group.stories = group.stories.filter((story) => story.id !== storyId);
      if (!group.stories.length) {
        groups.splice(groupIndex, 1);
        if (!groups.length) {
          close(false);
          if (onChanged) onChanged();
          return;
        }
        if (groupIndex >= groups.length) groupIndex = groups.length - 1;
        storyIndex = 0;
      } else if (storyIndex >= group.stories.length) {
        storyIndex = group.stories.length - 1;
      }
      setPaused(false);
      render();
    } catch (error) {
      showError(error);
      setPaused(false);
    }
  }

  root.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button') || event.target.closest('.modal-backdrop')) return;
    pointer = { x: event.clientX, y: event.clientY, start: performance.now() };
    swiping = false;
    setPaused(true);
    root.classList.add('dragging');
    if (root.setPointerCapture) {
      try { root.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    }
  });

  root.addEventListener('pointermove', (event) => {
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!swiping && dy > 14 && Math.abs(dy) > Math.abs(dx)) swiping = true;
    if (swiping) {
      const offset = Math.max(0, dy);
      root.style.transform = `translateY(${offset}px)`;
      root.style.opacity = String(Math.max(0.35, 1 - offset / 500));
    }
  });

  function endPointer(event) {
    if (!pointer) return;
    const pointerData = pointer;
    pointer = null;
    root.classList.remove('dragging');
    const duration = performance.now() - pointerData.start;
    const dx = event.clientX - pointerData.x;
    const dy = event.clientY - pointerData.y;
    if (swiping && dy > 110) {
      close();
      return;
    }
    swiping = false;
    root.style.transform = '';
    root.style.opacity = '';
    if (duration < 240 && Math.abs(dx) < 24 && Math.abs(dy) < 24) {
      const halfway = root.getBoundingClientRect().width / 2;
      if (event.clientX < halfway) prev();
      else next();
    } else {
      setPaused(false);
    }
  }

  root.addEventListener('pointerup', endPointer);
  root.addEventListener('pointercancel', (event) => {
    if (!pointer) return;
    pointer = null;
    swiping = false;
    root.classList.remove('dragging');
    root.style.transform = '';
    root.style.opacity = '';
    setPaused(false);
  });

  document.addEventListener('keydown', onKey);
  render();

  return { close };
}
