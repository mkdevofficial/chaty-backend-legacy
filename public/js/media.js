export function pickFile(accept = '*/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const done = (file) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file || null);
    };
    input.addEventListener('change', () => done(input.files && input.files[0]));
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_load_failed'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('image_encode_failed'));
    }, type, quality);
  });
}

function baseName(name) {
  return String(name || 'image').replace(/\.[^.]+$/, '').replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 60) || 'image';
}

export async function squareImage(file, size = 512) {
  if (!file.type.startsWith('image/')) throw new Error('not_image');
  if (file.type === 'image/gif') {
    return new File([file], file.name || 'avatar.gif', { type: file.type });
  }
  const image = await loadImage(file);
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const sx = (image.naturalWidth - side) / 2;
  const sy = (image.naturalHeight - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f766e';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
  return new File([blob], `${baseName(file.name)}-avatar.jpg`, { type: 'image/jpeg' });
}

export async function resizeImage(file, maxDimension = 1600, quality = 0.84) {
  if (!file.type.startsWith('image/')) throw new Error('not_image');
  if (file.type === 'image/gif') return file;
  const image = await loadImage(file);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const ratio = Math.min(1, maxDimension / Math.max(width, height));
  if (ratio === 1 && file.size < 2.2 * 1024 * 1024) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  return new File([blob], `${baseName(file.name)}.jpg`, { type: 'image/jpeg' });
}

export function blobToFile(blob, name, type) {
  return new File([blob], name, { type: type || blob.type });
}

const AUDIO_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mime of AUDIO_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function extensionForMime(mime) {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  return 'audio';
}

export class VoiceRecorder {
  constructor({ onTick = null } = {}) {
    this.onTick = onTick;
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.timer = null;
    this.startedAt = 0;
    this.cancelled = false;
    this.stopping = false;
  }

  get supported() {
    return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined');
  }

  async start() {
    if (!this.supported) throw new Error('recording_unsupported');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mimeType = pickAudioMime();
    this.recorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);
    this.chunks = [];
    this.cancelled = false;
    this.stopping = false;
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.start(250);
    this.startedAt = performance.now();
    this.timer = setInterval(() => {
      const seconds = (performance.now() - this.startedAt) / 1000;
      if (this.onTick) this.onTick(seconds);
      if (seconds >= 300) this.stop();
    }, 200);
  }

  currentSeconds() {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  _stopTracks() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.stopping) {
        reject(new Error('not_recording'));
        return;
      }
      this.stopping = true;
      const durationMs = Math.round(this.currentSeconds() * 1000);
      const mime = this.recorder.mimeType || 'audio/webm';
      const finish = () => {
        this._stopTracks();
        if (this.cancelled) {
          resolve(null);
          return;
        }
        const blob = new Blob(this.chunks, { type: mime });
        if (!blob.size) {
          reject(new Error('empty_recording'));
          return;
        }
        const ext = extensionForMime(mime);
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
        resolve({ file, blob, durationMs, mime });
      };
      this.recorder.addEventListener('stop', finish, { once: true });
      try {
        this.recorder.stop();
      } catch {
        this._stopTracks();
        reject(new Error('stop_failed'));
      }
    });
  }

  async cancel() {
    this.cancelled = true;
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        await this.stop();
      } catch {
        this._stopTracks();
      }
    } else {
      this._stopTracks();
    }
  }
}

export function attachmentDownloadUrl(attachment) {
  return `/api/uploads.php?action=file&id=${Number(attachment.id)}&download=1`;
}

export function triggerDownload(attachment) {
  const anchor = document.createElement('a');
  anchor.href = attachmentDownloadUrl(attachment);
  anchor.download = attachment.original_name || 'download';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
