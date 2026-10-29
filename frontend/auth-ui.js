import { createAuth } from './auth.js';

export async function mountAuth({ config, Client, startChat }) {
  const app = document.querySelector('#aisle-app');
  const logout = document.querySelector('#logout-button');
  let auth;
  let stage = 'configuration';

  function diagnostic(cause) {
    const known = ['access_denied', 'login_required', 'consent_required', 'unauthorized', 'invalid_grant', 'invalid_request', 'timeout'];
    const code = known.includes(cause?.error) ? cause.error
      : cause?.message === 'Invalid state' ? 'invalid_state' : 'unknown_error';
    // Keep tokens, callback URLs and arbitrary provider messages out of logs.
    console.error('Aisle startup failed', { stage, code, type: cause?.name || 'Error' });
    if (import.meta.env?.DEV && cause?.error === 'invalid_request') {
      console.error('Auth0 rejected the request:', String(cause.error_description || cause.message || '')
        .replace(/([?&](?:code|state|access_token|id_token)=)[^&\s]+/g, '$1[redacted]')
        .slice(0, 500));
    }
    return code;
  }

  // There is no local login page: signed-out visitors go straight to Auth0
  // Universal Login. This bare fallback screen only appears when the redirect
  // itself fails, Auth0 is misconfigured, or signed-in chat cannot start.
  function showFatal(message, { retry = false } = {}) {
    app.hidden = true;
    document.title = 'Something went wrong — aisle';
    let box = document.querySelector('#auth-fallback');
    if (!box) {
      box = document.createElement('main');
      box.id = 'auth-fallback';
      const text = document.createElement('p');
      text.id = 'auth-fallback-message';
      text.setAttribute('role', 'alert');
      box.append(text);
      document.body.prepend(box);
    }
    box.hidden = false;
    box.querySelector('#auth-fallback-message').textContent = message;
    let again = box.querySelector('button');
    if (retry && auth) {
      if (!again) {
        again = document.createElement('button');
        again.type = 'button';
        again.textContent = 'Try again';
        box.append(again);
      }
      again.hidden = false;
      again.onclick = () => {
        box.hidden = true;
        void beginUniversalLogin();
      };
      again.focus();
    } else if (again) {
      again.hidden = true;
    }
  }

  async function beginUniversalLogin(fallbackMessage = 'Login could not be opened. Check your connection and try again.') {
    try {
      await auth.login();
    } catch {
      showFatal(fallbackMessage, { retry: true });
    }
  }

  logout.addEventListener('click', async () => {
    logout.disabled = true;
    try {
      await auth.logout();
    } catch {
      logout.disabled = false;
      showFatal('Logout could not finish. Log in again to continue.', { retry: true });
    }
  });

  try {
    auth = createAuth(config.auth0, Client);
    stage = 'authentication';
    const user = await auth.initialize();
    if (!user?.sub) {
      await beginUniversalLogin();
      return;
    }
    stage = 'chat startup';
    document.querySelector('#account-name').textContent = user.name || user.email || 'Your account';
    startChat({ config, auth, user, onAuthenticationRequired: message => {
      void beginUniversalLogin(message);
    } });
    app.hidden = false;
  } catch (cause) {
    const code = diagnostic(cause);
    showFatal(stage === 'chat startup'
      ? 'You are signed in, but chat could not start. Reload the page and try again.'
      : auth
      ? `We couldn’t complete your login (${code}). Please try again.`
      : 'Login is not configured. Set the Auth0 values in .env.local and restart the frontend.');
  }
}
