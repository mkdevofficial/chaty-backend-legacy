import { state } from './state.js';
import { apiGet, apiPost, apiUpload, attachmentUrl } from './api.js';
import { t, errorText } from './i18n.js';
import {
  icon,
  escapeHtml,
  avatarHtml,
  showError,
  toast,
  formatTime,
  formatDay,
  formatRelative,
  formatDuration,
  formatFileSize,
  openImageViewer,
  isNearBottom,
  scrollToBottom,
  skeletonRows,
} from './ui.js';
import { navigate, goBack, updateNav } from './router.js';
import { pickFile, resizeImage, VoiceRecorder, triggerDownload } from './media.js';
import { renderStickerPicker, stickerUrl } from './stickers.js';

function dayKey(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function statusIcon(status) {
  if (status === 'read' || status === 'delivered') return icon('checks', 14);
  return icon('check', 13);
}

function messageHtml(message) {
  const out = message.sender_id === state.user.id;
  const attachment = message.attachment;
  let content = '';
  let bubbleClass = 'msg';

  if (message.type === 'text') {
    content = `<div class="msg-text">${escapeHtml(message.body)}</div>`;
  } else if (message.type === 'image' && attachment) {
    content = `
      <div class="msg-media" data-image-url="${escapeHtml(attachmentUrl(attachment))}">
        <img src="${escapeHtml(attachmentUrl(attachment))}" alt="${escapeHtml(t('common.photo'))}" loading="lazy">
      </div>
      ${message.body ? `<div class="msg-caption">${escapeHtml(message.body)}</div>` : ''}`;
  } else if (message.type === 'voice' && attachment) {
    const duration = attachment.duration_ms ? attachment.duration_ms / 1000 : 0;
    content = `
      <div class="audio-bubble" data-audio-bubble>
        <button type="button" class="audio-play" data-audio-toggle aria-label="${escapeHtml(t('chat.play'))}">${icon('play', 17)}</button>
        <div class="audio-main">
          <div class="audio-track" data-audio-track>
            <span class="rail"></span><span class="fill"></span><span class="knob"></span>
          </div>
          <div class="audio-times"><span data-audio-current>0:00</span><span data-audio-duration>${formatDuration(duration)}</span></div>
        </div>
        <audio class="chaty-audio" preload="metadata" src="${escapeHtml(attachmentUrl(attachment))}"></audio>
      </div>`;
  } else if (message.type === 'file' && attachment) {
    content = `
      <a class="file-bubble" href="${escapeHtml(attachmentUrl(attachment, true))}" data-download="${attachment.id}" download="${escapeHtml(attachment.original_name)}">
        <span class="file-icon">${icon('file', 21)}</span>
        <span class="file-info">
          <span class="file-name">${escapeHtml(attachment.original_name)}</span>
          <span class="file-size">${escapeHtml(formatFileSize(attachment.size))}</span>
        </span>
        ${icon('download', 18)}
      </a>`;
  } else if (message.type === 'sticker' && message.sticker) {
    bubbleClass += ' msg-sticker';
    content = `<img src="${escapeHtml(stickerUrl(message.sticker))}" alt="${escapeHtml(t('preview.sticker'))}" loading="lazy">`;
  } else {
    content = `<div class="msg-text faint">${escapeHtml(t('common.error'))}</div>`;
  }

  const meta = `
    <div class="msg-meta">
      <span>${escapeHtml(formatTime(message.created_at))}</span>
      ${out ? `<span class="msg-status ${escapeHtml(message.status)}" data-message-status="${message.id}" data-status="${escapeHtml(message.status)}">${statusIcon(message.status)}</span>` : ''}
    </div>`;

  return `
    <div class="msg-row ${out ? 'out' : 'in'}" data-message-id="${message.id}">
      <div class="${bubbleClass} ${out ? 'out' : 'in'}">
        ${content}
        ${meta}
      </div>
    </div>`;
}

function bindAudioBubble(bubble) {
  if (!bubble || bubble.dataset.audioBound) return;
  bubble.dataset.audioBound = '1';
  const audio = bubble.querySelector('audio');
  const playBtn = bubble.querySelector('[data-audio-toggle]');
  const fill = bubble.querySelector('.fill');
  const knob = bubble.querySelector('.knob');
  const currentEl = bubble.querySelector('[data-audio-current]');
  const durationEl = bubble.querySelector('[data-audio-duration]');
  const track = bubble.querySelector('[data-audio-track]');
  if (!audio || !playBtn || !track) return;

  const setPlaying = (playing) => {
    playBtn.innerHTML = icon(playing ? 'pause' : 'play', 17);
    playBtn.setAttribute('aria-label', t(playing ? 'chat.pause' : 'chat.play'));
  };

  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration)) durationEl.textContent = formatDuration(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 1;
    const pct = Math.min(100, (audio.currentTime / duration) * 100);
    fill.style.width = `${pct}%`;
    knob.style.insetInlineStart = `${pct}%`;
    currentEl.textContent = formatDuration(audio.currentTime);
  });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => {
    setPlaying(false);
    fill.style.width = '0%';
    knob.style.insetInlineStart = '0%';
    currentEl.textContent = '0:00';
  });
  audio.addEventListener('error', () => showError(new Error(t('chat.uploadFailed'))));
  playBtn.addEventListener('click', async () => {
    if (audio.paused) {
      document.querySelectorAll('audio.chaty-audio').forEach((other) => {
        if (other !== audio) other.pause();
      });
      try {
        await audio.play();
      } catch {
        showError(new Error(t('chat.uploadFailed')));
      }
    } else {
      audio.pause();
    }
  });
  track.addEventListener('click', (event) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const rtl = document.documentElement.dir === 'rtl';
    const ratio = rtl ? (rect.right - event.clientX) / rect.width : (event.clientX - rect.left) / rect.width;
    audio.currentTime = Math.max(0, Math.min(audio.duration, ratio * audio.duration));
  });
  setPlaying(false);
}

function bindAudioBubbles(container) {
  container.querySelectorAll('[data-audio-bubble]').forEach(bindAudioBubble);
}

export function renderChat(root, params) {
  const conversationId = Number(params.id);
  let disposed = false;
  let peer = null;
  let pollTimer = null;
  let allMessages = [];
  let messageIds = new Set();
  let lastMessageDay = null;
  let oldestId = 0;
  let newestId = 0;
  let hasMoreOlder = false;
  let initialLoaded = false;
  let typingTimer = null;
  let typingStopTimer = null;
  let typingSent = false;
  let peerTyping = false;
  let recorder = null;
  let recording = false;
  let uploading = false;
  let attachMenuOpen = false;
  let stickerOpen = false;

  root.innerHTML = `
    <section class="screen chat-screen">
      <header class="topbar">
        <button type="button" class="icon-btn" data-back aria-label="${escapeHtml(t('common.back'))}">${icon('back', 22)}</button>
        <button type="button" class="chat-identity" data-profile>
          <span data-peer-avatar></span>
          <span style="min-width:0">
            <span class="chat-title" data-peer-name>…</span>
            <span class="chat-status" data-peer-status></span>
          </span>
        </button>
      </header>
      <div class="messages" data-messages>
        <div style="margin:auto"><div class="loader"></div></div>
      </div>
      <div class="composer-wrap">
        <div class="recording-bar hidden" data-recording>
          <span class="recording-dot"></span>
          <span class="recording-time" data-recording-time>0:00</span>
          <div class="recording-wave">${Array.from({ length: 18 }, (_, index) => `<span style="animation-delay:${(index % 6) * 0.09}s"></span>`).join('')}</div>
          <button type="button" class="btn btn-sm btn-ghost" data-record-cancel>${escapeHtml(t('chat.cancelRecording'))}</button>
          <button type="button" class="btn btn-sm btn-primary" data-record-send>${escapeHtml(t('chat.sendRecording'))}</button>
        </div>
        <div class="attach-menu hidden" data-attach-menu>
          <button type="button" class="menu-item" data-attach-photo>${icon('image', 19)} ${escapeHtml(t('chat.photo'))}</button>
          <button type="button" class="menu-item" data-attach-file>${icon('file', 19)} ${escapeHtml(t('chat.file'))}</button>
        </div>
        <form class="composer" data-composer>
          <button type="button" class="icon-btn" data-attach aria-label="${escapeHtml(t('chat.attach'))}">${icon('plus', 23)}</button>
          <div class="input-shell">
            <textarea rows="1" data-input placeholder="${escapeHtml(t('chat.placeholder'))}" maxlength="5000" aria-label="${escapeHtml(t('chat.messagePlaceholder'))}"></textarea>
            <button type="button" class="icon-btn" data-sticker aria-label="${escapeHtml(t('chat.sticker'))}">${icon('sticker', 21)}</button>
          </div>
          <button type="button" class="icon-btn mic-btn" data-mic aria-label="${escapeHtml(t('chat.record'))}">${icon('mic', 21)}</button>
          <button type="submit" class="icon-btn send-btn" data-send aria-label="${escapeHtml(t('common.send'))}">${icon('send', 20)}</button>
        </form>
        <div class="sticker-panel hidden" data-sticker-panel></div>
      </div>
    </section>`;

  const messagesEl = root.querySelector('[data-messages]');
  const composer = root.querySelector('[data-composer]');
  const input = root.querySelector('[data-input]');
  const attachMenu = root.querySelector('[data-attach-menu]');
  const stickerPanel = root.querySelector('[data-sticker-panel]');
  const recordingBar = root.querySelector('[data-recording]');
  const identity = root.querySelector('[data-profile]');

  root.querySelector('[data-back]').addEventListener('click', () => goBack());
  identity.addEventListener('click', () => {
    if (peer) navigate('user', { id: peer.id });
  });

  function setComposerHasText() {
    composer.classList.toggle('has-text', input.value.trim().length > 0);
    input.style.height = 'auto';
    input.style.height = `${Math.min(110, input.scrollHeight)}px`;
  }

  function updatePeerHeader() {
    if (!peer) return;
    const avatarEl = root.querySelector('[data-peer-avatar]');
    const nameEl = root.querySelector('[data-peer-name]');
    const statusEl = root.querySelector('[data-peer-status]');
    avatarEl.innerHTML = avatarHtml(peer, { size: 40, status: true });
    nameEl.textContent = peer.display_name;
    if (peerTyping) {
      statusEl.textContent = t('chat.typing');
      statusEl.className = 'chat-status typing';
    } else if (peer.online) {
      statusEl.textContent = t('chat.online');
      statusEl.className = 'chat-status online';
    } else {
      statusEl.textContent = t('chat.lastSeen', { time: formatRelative(peer.last_seen) });
      statusEl.className = 'chat-status';
    }
  }

  function updateTicks(readMarker, deliveredMarker) {
    messagesEl.querySelectorAll('[data-message-status]').forEach((statusEl) => {
      const id = Number(statusEl.dataset.messageStatus);
      const current = statusEl.dataset.status || 'sent';
      let next = current;
      if (id <= readMarker) next = 'read';
      else if (id <= deliveredMarker) next = 'delivered';
      const rank = { sent: 0, delivered: 1, read: 2 };
      if (rank[next] > rank[current]) {
        statusEl.dataset.status = next;
        statusEl.className = `msg-status ${next}`;
        statusEl.innerHTML = statusIcon(next);
        const message = allMessages.find((item) => item.id === id);
        if (message) message.status = next;
      }
    });
  }

  function renderAll() {
    if (!allMessages.length) {
      messagesEl.innerHTML = `
        <div class="empty-state" style="margin:auto;min-height:auto;padding:24px">
          <div class="empty-art">${icon('messageCircle', 34)}</div>
          <h3>${escapeHtml(t('chats.sayHi'))}</h3>
          <p>${escapeHtml(t('chats.emptyText'))}</p>
        </div>`;
      lastMessageDay = null;
      return;
    }
    let html = '';
    if (hasMoreOlder) {
      html += `<button type="button" class="load-older" data-load-older>${escapeHtml(t('chat.loadOlder'))}</button>`;
    }
    let currentDay = null;
    for (const message of allMessages) {
      const key = dayKey(message.created_at);
      if (key !== currentDay) {
        currentDay = key;
        html += `<div class="day-sep">${escapeHtml(formatDay(message.created_at))}</div>`;
      }
      html += messageHtml(message);
    }
    messagesEl.innerHTML = html;
    lastMessageDay = currentDay;
    bindAudioBubbles(messagesEl);
    messagesEl.querySelector('[data-load-older]')?.addEventListener('click', loadOlder);
  }

  function appendMessage(message, scroll = true) {
    if (messageIds.has(message.id)) return;
    if (messagesEl.querySelector('.empty-state')) messagesEl.innerHTML = '';
    const nearBottom = isNearBottom(messagesEl);
    const key = dayKey(message.created_at);
    let html = '';
    if (key !== lastMessageDay) {
      html += `<div class="day-sep">${escapeHtml(formatDay(message.created_at))}</div>`;
      lastMessageDay = key;
    }
    html += messageHtml(message);
    const wasEmpty = messagesEl.children.length === 0;
    messagesEl.insertAdjacentHTML('beforeend', html);
    const newNode = messagesEl.querySelector(`[data-message-id="${message.id}"]`);
    if (newNode) bindAudioBubbles(newNode);
    messageIds.add(message.id);
    allMessages.push(message);
    allMessages.sort((a, b) => a.id - b.id);
    newestId = Math.max(newestId, message.id);
    if (!oldestId) oldestId = message.id;
    if (scroll && (nearBottom || wasEmpty || message.sender_id === state.user.id)) {
      scrollToBottom(messagesEl, true);
    }
  }

  async function loadOlder(event) {
    const btn = event ? event.currentTarget : null;
    if (!oldestId) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('common.loading');
    }
    try {
      const data = await apiGet('messages', 'list', {
        conversation_id: conversationId,
        before_id: oldestId,
        limit: 30,
      });
      const previousHeight = messagesEl.scrollHeight;
      const previousTop = messagesEl.scrollTop;
      for (const message of data.messages) {
        if (!messageIds.has(message.id)) {
          messageIds.add(message.id);
          allMessages.push(message);
        }
      }
      allMessages.sort((a, b) => a.id - b.id);
      hasMoreOlder = Boolean(data.has_more_older);
      oldestId = allMessages.length ? allMessages[0].id : oldestId;
      if (peer && data.conversation?.peer) {
        peer = data.conversation.peer;
        updatePeerHeader();
      }
      renderAll();
      const delta = messagesEl.scrollHeight - previousHeight;
      messagesEl.scrollTop = previousTop + delta;
    } catch (error) {
      showError(error);
      if (btn) {
        btn.disabled = false;
        btn.textContent = t('chat.loadOlder');
      }
    }
  }

  async function markRead() {
    try {
      await apiPost('messages', 'read', { conversation_id: conversationId });
      const conversation = state.conversations.find((item) => item.id === conversationId);
      if (conversation) conversation.unread = 0;
      const data = await apiGet('conversations', 'list');
      state.conversations = data.conversations || [];
      state.unreadTotal = state.conversations.reduce((sum, item) => sum + (Number(item.unread) || 0), 0);
      updateNav();
    } catch {
      /* read receipts are best-effort */
    }
  }

  function consumeMessages(data, { append = true } = {}) {
    if (data.conversation?.peer) {
      peer = data.conversation.peer;
      updatePeerHeader();
    }
    const incoming = [];
    for (const message of data.messages || []) {
      if (!messageIds.has(message.id)) incoming.push(message);
    }
    if (append && incoming.length) {
      for (const message of incoming) appendMessage(message, true);
    } else if (!append) {
      for (const message of incoming) {
        messageIds.add(message.id);
        allMessages.push(message);
      }
    }
    allMessages.sort((a, b) => a.id - b.id);
    if (allMessages.length) {
      oldestId = allMessages[0].id;
      newestId = allMessages[allMessages.length - 1].id;
    }
    updateTicks(Number(data.my_read_marker) || 0, Number(data.my_delivered_marker) || 0);
    if (incoming.some((message) => message.sender_id !== state.user.id)) {
      markRead();
    }
  }

  async function initialLoad() {
    try {
      const data = await apiGet('messages', 'list', { conversation_id: conversationId, limit: 30 });
      if (disposed) return;
      peer = data.conversation.peer;
      hasMoreOlder = Boolean(data.has_more_older);
      allMessages = [];
      messageIds = new Set();
      for (const message of data.messages || []) {
        messageIds.add(message.id);
        allMessages.push(message);
      }
      allMessages.sort((a, b) => a.id - b.id);
      oldestId = allMessages.length ? allMessages[0].id : 0;
      newestId = allMessages.length ? allMessages[allMessages.length - 1].id : 0;
      updatePeerHeader();
      renderAll();
      updateTicks(Number(data.my_read_marker) || 0, Number(data.my_delivered_marker) || 0);
      scrollToBottom(messagesEl, false);
      if ((data.messages || []).some((message) => message.sender_id !== state.user.id)) {
        markRead();
      }
      initialLoaded = true;
      schedulePoll();
    } catch (error) {
      if (disposed) return;
      messagesEl.innerHTML = `
        <div class="empty-state" style="margin:auto">
          <div class="empty-art">${icon('info', 34)}</div>
          <h3>${escapeHtml(t('common.error'))}</h3>
          <p>${escapeHtml(errorText(error))}</p>
          <button type="button" class="btn btn-ghost mt-8" data-retry-load>${icon('refresh', 18)} ${escapeHtml(t('common.retry'))}</button>
        </div>`;
      messagesEl.querySelector('[data-retry-load]')?.addEventListener('click', () => {
        messagesEl.innerHTML = '<div style="margin:auto"><div class="loader"></div></div>';
        initialLoad();
      });
    }
  }

  async function poll() {
    if (disposed || !initialLoaded) return;
    try {
      const data = await apiGet('messages', 'list', {
        conversation_id: conversationId,
        after_id: newestId || 0,
        limit: 60,
      });
      if (disposed) return;
      consumeMessages(data);
      peerTyping = Boolean(data.peer_typing);
      updatePeerHeader();
    } catch (error) {
      if (error.code !== 'network') console.warn(error);
    } finally {
      if (!disposed) pollTimer = setTimeout(poll, document.hidden ? 8000 : 1800);
    }
  }

  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, document.hidden ? 8000 : 1800);
  }

  function onVisibility() {
    if (disposed) return;
    if (!document.hidden && initialLoaded) {
      schedulePoll();
      setTimeout(() => {
        if (!document.hidden && initialLoaded) markRead();
      }, 600);
    }
  }

  function sendTyping() {
    if (disposed || !initialLoaded) return;
    if (!typingSent) {
      typingSent = true;
      updatePeerHeader();
      apiPost('messages', 'typing', { conversation_id: conversationId, typing: true }).catch(() => {});
    }
    clearTimeout(typingStopTimer);
    typingStopTimer = setTimeout(stopTyping, 1600);
  }

  function stopTyping() {
    clearTimeout(typingTimer);
    clearTimeout(typingStopTimer);
    typingTimer = null;
    typingStopTimer = null;
    if (typingSent) {
      typingSent = false;
      updatePeerHeader();
      apiPost('messages', 'typing', { conversation_id: conversationId, typing: false }).catch(() => {});
    }
  }

  async function sendText() {
    const value = input.value.trim();
    if (!value || uploading) return;
    input.value = '';
    setComposerHasText();
    stopTyping();
    try {
      const data = await apiPost('messages', 'send', {
        conversation_id: conversationId,
        type: 'text',
        body: value,
      });
      appendMessage(data.message, true);
    } catch (error) {
      input.value = value;
      setComposerHasText();
      showError(error);
    }
  }

  async function sendAttachment(file, type, { durationMs = null, caption = '' } = {}) {
    if (uploading) return;
    uploading = true;
    const loadingToast = toast(t('chat.uploading'), 'info', 10000);
    try {
      const attachment = await apiUpload(file, durationMs);
      const payload = {
        conversation_id: conversationId,
        type,
        attachment_id: attachment.id,
      };
      if (caption) payload.body = caption;
      const data = await apiPost('messages', 'send', payload);
      appendMessage(data.message, true);
    } catch (error) {
      showError(error);
    } finally {
      uploading = false;
      if (loadingToast && loadingToast.parentElement) loadingToast.remove();
    }
  }

  async function chooseImage() {
    const file = await pickFile('image/*');
    if (!file) return;
    if (file.size > state.limits.image) {
      toast(t('errors.upload_too_large'), 'error');
      return;
    }
    try {
      const resized = await resizeImage(file, 1600);
      await sendAttachment(resized, 'image');
    } catch {
      toast(t('chat.imageFailed'), 'error');
    }
  }

  async function chooseFile() {
    const file = await pickFile('*/*');
    if (!file) return;
    if (file.size > state.limits.file) {
      toast(t('chat.fileTooLarge'), 'error');
      return;
    }
    await sendAttachment(file, 'file');
  }

  function setPanelVisibility() {
    attachMenu.classList.toggle('hidden', !attachMenuOpen);
    stickerPanel.classList.toggle('hidden', !stickerOpen);
  }

  async function toggleStickers() {
    stickerOpen = !stickerOpen;
    if (stickerOpen) {
      attachMenuOpen = false;
      setPanelVisibility();
      try {
        await renderStickerPicker(stickerPanel, {
          onPick: async (file) => {
            stickerOpen = false;
            setPanelVisibility();
            try {
              const data = await apiPost('messages', 'send', {
                conversation_id: conversationId,
                type: 'sticker',
                sticker: file,
              });
              appendMessage(data.message, true);
            } catch (error) {
              showError(error);
            }
          },
        });
      } catch (error) {
        showError(error);
        stickerOpen = false;
        setPanelVisibility();
      }
    } else {
      setPanelVisibility();
    }
  }

  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    sendText();
  });

  input.addEventListener('input', () => {
    setComposerHasText();
    if (!input.value.trim()) {
      stopTyping();
      return;
    }
    if (!typingTimer) {
      sendTyping();
      typingTimer = setTimeout(() => {
        typingTimer = null;
        if (input.value.trim()) sendTyping();
      }, 2200);
    } else {
      sendTyping();
    }
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendText();
    }
  });

  input.addEventListener('blur', () => stopTyping());

  root.querySelector('[data-attach]').addEventListener('click', () => {
    attachMenuOpen = !attachMenuOpen;
    stickerOpen = false;
    setPanelVisibility();
  });
  root.querySelector('[data-sticker]').addEventListener('click', toggleStickers);
  root.querySelector('[data-attach-photo]').addEventListener('click', () => {
    attachMenuOpen = false;
    setPanelVisibility();
    chooseImage();
  });
  root.querySelector('[data-attach-file]').addEventListener('click', () => {
    attachMenuOpen = false;
    setPanelVisibility();
    chooseFile();
  });

  async function startRecording() {
    if (recording || uploading) return;
    recorder = new VoiceRecorder({
      onTick: (seconds) => {
        const timeEl = root.querySelector('[data-recording-time]');
        if (timeEl) timeEl.textContent = formatDuration(seconds);
      },
    });
    if (!recorder.supported) {
      toast(t('chat.recordingFailed'), 'error');
      recorder = null;
      return;
    }
    try {
      await recorder.start();
      recording = true;
      attachMenuOpen = false;
      stickerOpen = false;
      setPanelVisibility();
      composer.classList.add('hidden');
      recordingBar.classList.remove('hidden');
      const timeEl = root.querySelector('[data-recording-time]');
      if (timeEl) timeEl.textContent = '0:00';
    } catch (error) {
      recorder = null;
      toast(error.name === 'NotAllowedError' ? t('chat.micDenied') : t('chat.recordingFailed'), 'error');
    }
  }

  function endRecordingUi() {
    recording = false;
    composer.classList.remove('hidden');
    recordingBar.classList.add('hidden');
  }

  async function finishRecording(send) {
    if (!recorder || !recording) return;
    const current = recorder;
    recording = false;
    try {
      const result = await current.stop();
      endRecordingUi();
      if (!send || !result) {
        recorder = null;
        return;
      }
      if (result.durationMs < 500) {
        toast(t('chat.recordingTooShort'), 'error');
        recorder = null;
        return;
      }
      recorder = null;
      await sendAttachment(result.file, 'voice', { durationMs: result.durationMs });
    } catch {
      endRecordingUi();
      recorder = null;
    }
  }

  root.querySelector('[data-mic]').addEventListener('click', startRecording);
  root.querySelector('[data-record-cancel]').addEventListener('click', async () => {
    if (recorder && recording) {
      await recorder.cancel();
    }
    recorder = null;
    endRecordingUi();
  });
  root.querySelector('[data-record-send]').addEventListener('click', () => finishRecording(true));

  messagesEl.addEventListener('click', (event) => {
    const image = event.target.closest('[data-image-url]');
    if (image) {
      openImageViewer(image.dataset.imageUrl, t('common.photo'));
      return;
    }
    const download = event.target.closest('[data-download]');
    if (download) {
      event.preventDefault();
      const attachment = allMessages
        .flatMap((message) => (message.attachment ? [message.attachment] : []))
        .find((item) => String(item.id) === download.dataset.download);
      if (attachment) triggerDownload(attachment);
      else window.location.href = download.href;
    }
  });

  const onDocumentClick = (event) => {
    if (!attachMenuOpen && !stickerOpen) return;
    const wrap = root.querySelector('.composer-wrap');
    if (wrap && !wrap.contains(event.target)) {
      attachMenuOpen = false;
      stickerOpen = false;
      setPanelVisibility();
    }
  };
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('visibilitychange', onVisibility);

  initialLoad();

  return () => {
    disposed = true;
    if (pollTimer) clearTimeout(pollTimer);
    stopTyping();
    if (recorder) {
      recorder.cancel();
      recorder = null;
    }
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
