import { state, setCsrf } from './state.js';

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message || code || 'Request failed');
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

let unauthorizedHandler = null;

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

function buildUrl(resource, action, params = {}) {
  const query = new URLSearchParams();
  if (action) query.set('action', action);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return `/api/${resource}.php${qs ? `?${qs}` : ''}`;
}

async function parseResponse(response) {
  let json;
  try {
    json = await response.json();
  } catch {
    throw new ApiError('server_error', 'The server returned an invalid response', response.status);
  }
  if (!response.ok || !json.ok) {
    const err = json && json.error ? json.error : {};
    throw new ApiError(err.code || 'server_error', err.message || 'Request failed', response.status);
  }
  return json.data;
}

async function refreshSession() {
  try {
    const data = await rawRequest('auth', 'bootstrap', 'GET', {});
    setCsrf(data.csrf_token);
    return true;
  } catch {
    return false;
  }
}

async function rawRequest(resource, action, method, options) {
  const { params, body, form, retry = true } = options;
  const headers = { Accept: 'application/json' };
  if (method !== 'GET' && state.csrf) {
    headers['X-CSRF-Token'] = state.csrf;
  }
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(buildUrl(resource, action, params), {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('network', 'Network request failed', 0);
  }

  if (response.status === 401 && state.user && unauthorizedHandler) {
    unauthorizedHandler();
  }

  if (response.status === 419 && retry) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return rawRequest(resource, action, method, { ...options, retry: false });
    }
  }

  return parseResponse(response);
}

export function apiGet(resource, action = '', params = {}) {
  return rawRequest(resource, action, 'GET', { params });
}

export function apiPost(resource, action = '', body = {}) {
  return rawRequest(resource, action, 'POST', { body });
}

export async function apiUpload(file, durationMs = null) {
  const form = new FormData();
  form.append('file', file, file.name || 'upload');
  if (durationMs !== null) form.append('duration_ms', String(Math.round(durationMs)));
  const data = await rawRequest('uploads', 'upload', 'POST', { form, params: { action: 'upload' } });
  return data.attachment;
}

export async function bootstrap() {
  const data = await apiGet('auth', 'bootstrap');
  setCsrf(data.csrf_token);
  return data;
}

export function attachmentUrl(attachment, download = false) {
  if (!attachment) return '';
  return `/api/uploads.php?action=file&id=${attachment.id}${download ? '&download=1' : ''}`;
}

export function avatarUrl(user) {
  return user && user.avatar_url ? user.avatar_url : '';
}
