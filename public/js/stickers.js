import { state } from './state.js';
import { t } from './i18n.js';
import { escapeHtml } from './ui.js';

let manifestPromise = null;
const RECENT_KEY = 'chaty_recent_stickers';

export function loadStickerCatalog() {
  if (!manifestPromise) {
    manifestPromise = fetch('/assets/stickers/manifest.json', { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('Could not load stickers');
        return response.json();
      })
      .catch((error) => {
        manifestPromise = null;
        throw error;
      });
  }
  return manifestPromise;
}

export function stickerUrl(file) {
  return `/assets/stickers/${file}`;
}

export function getRecentStickers() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string').slice(0, 24) : [];
  } catch {
    return [];
  }
}

export function addRecentSticker(file) {
  const list = getRecentStickers().filter((item) => item !== file);
  list.unshift(file);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 24)));
  } catch {
    /* ignore */
  }
}

export async function renderStickerPicker(container, { onPick }) {
  const catalog = await loadStickerCatalog();
  let activePack = catalog.packs[0]?.id || '';
  container.innerHTML = '<div class="sticker-label">…</div>';

  const recent = getRecentStickers();
  const all = new Map();
  for (const pack of catalog.packs) {
    for (const sticker of pack.stickers) all.set(sticker.file, sticker);
  }

  function render() {
    const tabs = [];
    if (recent.length) tabs.push({ id: 'recent', label: '🕘' });
    for (const pack of catalog.packs) {
      tabs.push({ id: pack.id, label: pack.icon, title: pack.name[state.lang] || pack.name.en });
    }
    const active = tabs.some((tab) => tab.id === activePack) ? activePack : tabs[0]?.id;
    activePack = active;
    let stickers = [];
    if (active === 'recent') {
      stickers = recent.map((file) => all.get(file)).filter(Boolean);
    } else {
      const pack = catalog.packs.find((p) => p.id === active);
      stickers = pack ? pack.stickers : [];
    }
    container.innerHTML = `
      <div class="sticker-tabs">
        ${tabs.map((tab) => `<button type="button" class="sticker-tab ${tab.id === active ? 'active' : ''}" data-pack="${escapeHtml(tab.id)}" title="${escapeHtml(tab.title || t('stories.yourStory'))}">${escapeHtml(tab.label)}</button>`).join('')}
      </div>
      ${active === 'recent' ? `<div class="sticker-label">${escapeHtml(t('chat.sticker'))}</div>` : ''}
      <div class="sticker-grid">
        ${stickers.map((sticker) => `<button type="button" data-sticker="${escapeHtml(sticker.file)}" title="${escapeHtml(sticker.label[state.lang] || sticker.label.en)}"><img src="${stickerUrl(sticker.file)}" alt="${escapeHtml(sticker.label[state.lang] || sticker.label.en)}" loading="lazy"></button>`).join('')}
      </div>`;
    container.querySelectorAll('[data-pack]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activePack = btn.dataset.pack;
        render();
      });
    });
    container.querySelectorAll('[data-sticker]').forEach((btn) => {
      btn.addEventListener('click', () => {
        addRecentSticker(btn.dataset.sticker);
        onPick(btn.dataset.sticker);
      });
    });
  }

  render();
}
