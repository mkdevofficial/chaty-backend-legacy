import { state, setUser, updatePrefs } from './state.js';
import { apiPost } from './api.js';
import { t, setLanguage, errorText } from './i18n.js';
import { applyVisuals } from './theme.js';
import { icon, escapeHtml, toast } from './ui.js';

let mode = 'login';
let draft = { phone: '', password: '', username: '', display_name: '' };

export function renderAuth(app, { onAuthed }) {
  const render = () => {
    const isRegister = mode === 'register';
    app.innerHTML = `
      <div class="auth-screen">
        <div class="auth-inner">
          <div class="auth-hero">
            <div class="auth-logo">${icon('messageCircle', 38)}</div>
            <h1>Chaty</h1>
            <p>${escapeHtml(t('app.tagline'))}</p>
          </div>
          <div class="auth-card">
            <div class="auth-tabs">
              <button type="button" data-mode="login" class="${!isRegister ? 'active' : ''}">${escapeHtml(t('auth.login'))}</button>
              <button type="button" data-mode="register" class="${isRegister ? 'active' : ''}">${escapeHtml(t('auth.register'))}</button>
            </div>
            <form id="auth-form" novalidate>
              <div class="field">
                <label for="auth-phone">${escapeHtml(t('auth.phone'))}</label>
                <input id="auth-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" value="${escapeHtml(draft.phone)}" placeholder="${escapeHtml(t('auth.phonePlaceholder'))}" required>
              </div>
              ${isRegister ? `
              <div class="field">
                <label for="auth-username">${escapeHtml(t('auth.username'))}</label>
                <input id="auth-username" name="username" type="text" autocomplete="username" value="${escapeHtml(draft.username)}" placeholder="${escapeHtml(t('auth.usernamePlaceholder'))}" required>
                <span class="hint">${escapeHtml(t('auth.usernameHint'))}</span>
              </div>
              <div class="field">
                <label for="auth-display">${escapeHtml(t('auth.displayName'))}</label>
                <input id="auth-display" name="display_name" type="text" autocomplete="name" value="${escapeHtml(draft.display_name)}" placeholder="${escapeHtml(t('auth.displayPlaceholder'))}">
                <span class="hint">${escapeHtml(t('auth.displayHint'))}</span>
              </div>` : ''}
              <div class="field">
                <label for="auth-password">${escapeHtml(t('auth.password'))}</label>
                <input id="auth-password" name="password" type="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" value="${escapeHtml(draft.password)}" required minlength="8">
                <span class="hint">${escapeHtml(t('auth.passwordHint'))}</span>
              </div>
              <div class="form-error" id="auth-error"></div>
              <button type="submit" class="btn btn-primary btn-block" id="auth-submit">
                ${icon(isRegister ? 'plus' : 'arrowRight', 18)}
                <span>${escapeHtml(isRegister ? t('auth.registerBtn') : t('auth.loginBtn'))}</span>
              </button>
            </form>
            <div class="auth-demo">
              <strong>${escapeHtml(t('auth.demo'))}</strong>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
                <button type="button" class="mini-btn accent" data-demo="layla">@layla · +15550000001</button>
                <button type="button" class="mini-btn accent" data-demo="omar">@omar · +15550000002</button>
              </div>
              <div style="margin-top:4px">${escapeHtml(t('auth.passwordHint'))} — chaty1234</div>
            </div>
          </div>
          <div class="auth-lang">
            <button type="button" class="lang-pill" id="auth-lang">
              ${icon('globe', 16)} <span style="margin-inline-start:6px">${escapeHtml(t('auth.langToggle'))}</span>
            </button>
          </div>
        </div>
      </div>`;

    const form = app.querySelector('#auth-form');
    const errorBox = app.querySelector('#auth-error');
    const submit = app.querySelector('#auth-submit');

    app.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode;
        render();
      });
    });

    form.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => {
        draft[input.name] = input.value;
        errorBox.textContent = '';
      });
    });

    app.querySelectorAll('[data-demo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const isLayla = btn.dataset.demo === 'layla';
        draft.phone = isLayla ? '+15550000001' : '+15550000002';
        draft.password = 'chaty1234';
        mode = 'login';
        render();
        const pass = app.querySelector('#auth-password');
        if (pass) pass.focus();
      });
    });

    app.querySelector('#auth-lang').addEventListener('click', () => {
      const next = state.lang === 'ar' ? 'en' : 'ar';
      setLanguage(next);
      updatePrefs({ lang: next });
      applyVisuals({ lang: next });
      render();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const phone = form.phone.value.trim();
      const password = form.password.value;
      draft.phone = phone;
      draft.password = password;
      errorBox.textContent = '';
      if (!phone || !password) {
        errorBox.textContent = t('errors.invalid_credentials');
        return;
      }
      submit.disabled = true;
      const label = submit.querySelector('span');
      const original = label.textContent;
      label.textContent = t('common.loading');
      try {
        let data;
        if (mode === 'register') {
          draft.username = form.username.value.trim();
          draft.display_name = form.display_name.value.trim();
          data = await apiPost('auth', 'register', {
            phone,
            password,
            username: draft.username,
            display_name: draft.display_name,
          });
        } else {
          data = await apiPost('auth', 'login', { phone, password });
        }
        setUser(data.user);
        applyVisuals({
          theme: data.user.theme,
          accent: data.user.accent,
          wallpaper: data.user.wallpaper,
          lang: data.user.lang,
        });
        toast(t('auth.welcomeBack'), 'success');
        draft = { phone: '', password: '', username: '', display_name: '' };
        onAuthed();
      } catch (error) {
        errorBox.textContent = errorText(error);
        toast(errorText(error), 'error');
      } finally {
        submit.disabled = false;
        label.textContent = original;
      }
    });
  };

  render();
}
