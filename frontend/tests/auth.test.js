import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createAuth, AuthenticationRequiredError } from '../auth.js';
import { createChatApi } from '../api.js';

const config = { domain: 'tenant.us.auth0.com', clientId: 'spa-client', audience: 'https://api.aisle.app' };
function setup(url = 'http://localhost:8770/', overrides = {}) {
  const browser = new JSDOM('', { url }).window;
  const calls = {};
  const client = {
    checkSession: async () => {},
    isAuthenticated: async () => true,
    getUser: async () => ({ sub: 'auth0|one' }),
    handleRedirectCallback: async () => ({ appState: { returnTo: '/?view=chat' } }),
    loginWithRedirect: async (options) => { calls.login = options; },
    logout: async (options) => { calls.logout = options; },
    getTokenSilently: async () => 'access-token',
    ...overrides,
  };
  const auth = createAuth(config, class { constructor(options) { calls.options = options; return client; } }, browser);
  return { auth, browser, calls };
}

test('configures PKCE SDK with API audience and memory storage', async () => {
  const { auth, calls } = setup();
  assert.equal((await auth.initialize()).sub, 'auth0|one');
  assert.equal(calls.options.authorizationParams.audience, config.audience);
  assert.equal(calls.options.authorizationParams.redirect_uri, 'http://localhost:8770/');
  assert.equal(calls.options.cacheLocation, 'memory');
});

test('handles callback before session check and removes OAuth parameters', async () => {
  const { auth, browser } = setup('http://localhost:8770/?code=secret&state=state', {
    checkSession: async () => { throw new Error('must not check session before callback'); },
  });
  await auth.initialize();
  assert.equal(browser.location.href, 'http://localhost:8770/?view=chat');
});

test('does not accept an external return URL from callback state', async () => {
  const { auth, browser } = setup('http://localhost:8770/?code=x&state=y', {
    handleRedirectCallback: async () => ({ appState: { returnTo: '//evil.example/' } }),
  });
  await auth.initialize();
  assert.equal(browser.location.href, 'http://localhost:8770/');
});

test('cleans denied callback parameters even when SDK rejects', async () => {
  const { auth, browser } = setup('http://localhost:8770/?error=access_denied&state=x', {
    handleRedirectCallback: async () => { throw new Error('denied'); },
  });
  await assert.rejects(auth.initialize(), /denied/);
  assert.equal(browser.location.search, '');
});

test('signed-out session does not expose a user', async () => {
  const { auth } = setup(undefined, { isAuthenticated: async () => false });
  assert.equal(await auth.initialize(), null);
});

test('login restores local URL and logout returns to app origin', async () => {
  const { auth, calls } = setup('http://localhost:8770/?view=chat');
  await auth.login();
  await auth.logout();
  assert.equal(calls.login.appState.returnTo, '/?view=chat');
  assert.equal(calls.logout.logoutParams.returnTo, 'http://localhost:8770/');
});

test('sends access token in Authorization header and preserves chat payload', async () => {
  const { auth } = setup();
  const payload = { message: 'Shoes', thread_id: 'conversation', generate_title: true };
  const api = createChatApi(auth, { apiUrl: '/api/chat', timeoutMs: 1000 }, async (url, options) => {
    assert.equal(url, '/api/chat');
    assert.equal(options.headers.Authorization, 'Bearer access-token');
    assert.deepEqual(JSON.parse(options.body), payload);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ response: 'What size?', thread_id: 'conversation' }));
  });
  assert.equal((await api(payload)).response, 'What size?');
});

test('never sends API request when silent token acquisition needs login', async () => {
  const { auth } = setup(undefined, {
    getTokenSilently: async () => { throw { error: 'login_required' }; },
  });
  const api = createChatApi(auth, { timeoutMs: 1000 }, () => assert.fail('must not fetch'));
  await assert.rejects(api({ message: 'Shoes' }), AuthenticationRequiredError);
});

test('API 401 asks for login without automatically repeating a chat POST', async () => {
  const { auth } = setup();
  let count = 0;
  const api = createChatApi(auth, { timeoutMs: 1000 }, async () => {
    count++;
    return new Response('', { status: 401 });
  });
  await assert.rejects(api({}), AuthenticationRequiredError);
  assert.equal(count, 1);
});

test('rejects missing Auth0 configuration', () => {
  assert.throws(() => createAuth({ ...config, audience: '' }, class {}), /configuration/i);
});
