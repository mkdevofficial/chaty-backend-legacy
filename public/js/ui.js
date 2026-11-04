import { t, errorText, getLocale } from './i18n.js';

const icons = {
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  sticker: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  play: '<path d="m6 3 14 9-14 9V3z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checks: '<path d="m2 12 4 4L16 6"/><path d="m11 12 4 4L23 7"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 22 10.5C21.7 5.8 17.4 2 12 2z"/>',
  wallpaper: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 15 5-5 4 4 3-3 6 6"/><circle cx="8" cy="8" r="1.5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  sparkles: '<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  usersPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  messageCircle: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
};

export function icon(name, size = 22, extra = '') {
  const body = icons[name] || icons.info;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function initials(user) {
  const name = (user && (user.display_name || user.username)) || '?';
  return Array.from(name.trim())[0]?.toUpperCase() || '?';
}

export function avatarHtml(user, options = {}) {
  if (!user) {
    return `<span class="avatar" style="--size:${options.size || 46}px">?</span>`;
  }
  const size = options.size || 46;
  const hue = (Number(user.id || 1) * 47) % 360;
  const inner = user.avatar_url
    ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.display_name)}" loading="lazy">`
    : escapeHtml(initials(user));
  const avatar = `<span class="avatar ${options.square ? 'sq' : ''}" style="--size:${size}px;${user.avatar_url ? '' : `background:linear-gradient(135deg,hsl(${hue} 62% 34%),hsl(${(hue + 34) % 360} 72% 50%))`}">${inner}</span>`;
  if (options.ring) {
    return `<span class="avatar-ring ${options.seen ? 'seen' : ''}">${avatar}</span>`;
  }
  if (options.status) {
    return `<span class="avatar-wrap">${avatar}<span class="status-dot ${user.online ? '' : 'off'}"></span></span>`;
  }
  return avatar;
}

export function toast(message, type = 'info', timeout = 3200) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  const iconName = type === 'error' ? 'info' : type === 'success' ? 'check' : 'sparkles';
  node.innerHTML = `${icon(iconName, 18)}<span>${escapeHtml(message)}</span>`;
  root.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(-6px)';
    node.style.transition = 'opacity .18s ease, transform .18s ease';
    setTimeout(() => node.remove(), 180);
  }, timeout);
}

export function showError(error) {
  toast(errorText(error), 'error');
}

export function modal({ title, body = '', actions = [], onMount = null, onClose = null, dismissible = true }) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const head = document.createElement('div');
  head.className = 'modal-head';
  const heading = document.createElement('h3');
  heading.textContent = title || '';
  head.appendChild(heading);
  if (dismissible) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'icon-btn';
    closeBtn.innerHTML = icon('close', 20);
    closeBtn.setAttribute('aria-label', t('common.close'));
    closeBtn.addEventListener('click', () => close());
    head.appendChild(closeBtn);
  }
  sheet.appendChild(head);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  bodyEl.innerHTML = body;
  sheet.appendChild(bodyEl);

  const actionWrap = document.createElement('div');
  actionWrap.className = 'modal-actions';
  sheet.appendChild(actionWrap);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    backdrop.style.opacity = '0';
    setTimeout(() => {
      backdrop.remove();
      if (onClose) onClose();
    }, 150);
    document.removeEventListener('keydown', onKey);
  }

  function onKey(event) {
    if (event.key === 'Escape' && dismissible) close();
  }

  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${action.className || 'btn-ghost'}`;
    if (action.html) btn.innerHTML = action.html;
    else btn.textContent = action.label || '';
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const result = await (action.onClick ? action.onClick({ close, sheet, body: bodyEl }) : true);
        if (result !== false && action.close !== false) close();
      } finally {
        btn.disabled = false;
      }
    });
    actionWrap.appendChild(btn);
  }
  if (!actions.length) actionWrap.remove();

  if (dismissible) {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
  }
  backdrop.appendChild(sheet);
  root.appendChild(backdrop);
  document.addEventListener('keydown', onKey);
  if (onMount) onMount({ sheet, body: bodyEl, close });
  setTimeout(() => {
    const focusable = sheet.querySelector('input, textarea, button');
    if (focusable) focusable.focus({ preventScroll: true });
  }, 50);
  return { close, sheet, body: bodyEl };
}

export function confirmDialog(title, message, confirmLabel = null, danger = true) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const dlg = modal({
      title,
      body: `<p class="muted" style="margin:2px 0 4px;font-size:13px;line-height:1.6">${escapeHtml(message)}</p>`,
      actions: [
        { label: t('common.cancel'), className: 'btn-ghost', onClick: () => { settle(false); } },
        {
          label: confirmLabel || t('common.confirm'),
          className: danger ? 'btn-danger' : 'btn-primary',
          onClick: () => { settle(true); },
        },
      ],
      onMount: ({ close }) => {
        const origClose = close;
        close = () => { settle(false); origClose(); };
      },
    });
    const backdrop = dlg.sheet.parentElement;
    const observer = new MutationObserver(() => {
      if (!document.body.contains(backdrop)) {
        settle(false);
        observer.disconnect();
      }
    });
    observer.observe(document.getElementById('modal-root'), { childList: true });
  });
}

export function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(getLocale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp * 1000));
}

export function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(timestamp * 1000));
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatDay(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const diffDays = Math.round((startOfDay(today) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return t('common.today');
  if (diffDays === 1) return t('common.yesterday');
  return new Intl.DateTimeFormat(getLocale(), {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date);
}

export function formatChatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const diffDays = Math.round((startOfDay(today) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return formatTime(timestamp);
  if (diffDays === 1) return t('common.yesterday');
  if (diffDays < 7) {
    return new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'numeric' }).format(date);
}

export function formatRelative(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 45) return t('time.justNow');
  if (seconds < 3600) return t('time.minutes', { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('time.hours', { n: Math.floor(seconds / 3600) });
  if (seconds < 604800) return t('time.days', { n: Math.floor(seconds / 86400) });
  return formatDate(timestamp);
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} ${t('file.bytes')}`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ${t('file.kb')}`;
  return `${(n / (1024 * 1024)).toFixed(1)} ${t('file.mb')}`;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function isNearBottom(container, threshold = 120) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

export function scrollToBottom(container, smooth = false) {
  if (!container) return;
  container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

export function skeletonRows(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-row">
      <div class="sk-avatar skeleton"></div>
      <div class="sk-lines">
        <div class="sk-line skeleton w60"></div>
        <div class="sk-line skeleton w90"></div>
      </div>
    </div>`).join('');
}

export function messagePreview(message) {
  if (!message) return t('chats.noMessages');
  switch (message.type) {
    case 'image':
      return message.body ? `📷 ${message.body}` : t('preview.image');
    case 'voice':
      return t('preview.voice');
    case 'file':
      return message.attachment ? `📎 ${message.attachment.original_name}` : t('preview.file');
    case 'sticker':
      return t('preview.sticker');
    default:
      return message.body || '';
  }
}

export function openImageViewer(url, alt = '') {
  const root = document.getElementById('overlay-root');
  const viewer = el(`
    <div class="fullscreen-viewer" role="dialog" aria-modal="true">
      <div class="viewer-top">
        <button type="button" class="icon-btn viewer-close">${icon('close', 22)}</button>
      </div>
      <div class="viewer-body"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"></div>
    </div>`);
  const close = () => {
    viewer.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  viewer.querySelector('.viewer-close').addEventListener('click', close);
  viewer.addEventListener('click', (event) => { if (event.target === viewer || event.target.classList.contains('viewer-body')) close(); });
  document.addEventListener('keydown', onKey);
  root.appendChild(viewer);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
