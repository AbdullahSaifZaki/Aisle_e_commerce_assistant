import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { mountAuth } from '../auth-ui.js';
import { startChat } from '../app.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const config = {
  demoMode: false, apiUrl: '/api/chat', timeoutMs: 1000,
  auth0: { domain: 'tenant.us.auth0.com', clientId: 'spa', audience: 'https://api.aisle.app' },
};
const settle = () => new Promise(resolve => setImmediate(resolve));

test('authentication errors retain a diagnostic without exposing credentials', async t => {
  const { Client, find } = setup(t, { checkSession: async () => {
    throw Object.assign(new Error('private token must not be displayed'), { error: 'access_denied' });
  } });
  await mountAuth({ config, Client, startChat });
  assert.match(find('#auth-fallback-message').textContent, /access_denied/);
  assert.doesNotMatch(find('#auth-fallback-message').textContent, /private token/);
});

test('chat startup errors are not reported as failed login', async t => {
  const { Client, find } = setup(t, { isAuthenticated: async () => true });
  await mountAuth({ config, Client, startChat: () => { throw new Error('broken UI'); } });
  assert.match(find('#auth-fallback-message').textContent, /signed in.*chat could not start/i);
});

function setup(t, overrides = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost:8770/' });
  const replacements = {
    window: dom.window, document: dom.window.document, Node: dom.window.Node,
    localStorage: dom.window.localStorage,
    matchMedia: query => ({ matches: query.includes('reduced-motion'), addEventListener() {} }),
    requestAnimationFrame: callback => callback(),
  };
  dom.window.matchMedia = replacements.matchMedia;
  for (const [name, value] of Object.entries(replacements)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  t.after(() => dom.window.close());
  const client = {
    checkSession: async () => {}, isAuthenticated: async () => false,
    getUser: async () => ({ sub: 'auth0|alice', name: '<b>Alice</b>' }),
    getTokenSilently: async () => 'test-access-token',
    loginWithRedirect: async () => {}, logout: async () => {}, ...overrides,
  };
  const Client = class { constructor() { return client; } };
  const find = selector => dom.window.document.querySelector(selector);
  return { Client, find, dom };
}

test('signed-out users go straight to Universal Login', async t => {
  let called = 0;
  const { Client, find } = setup(t, { loginWithRedirect: async () => { called++; } });
  await mountAuth({ config, Client, startChat: () => assert.fail('must not initialize chat') });
  assert.equal(called, 1);
  assert.equal(find('#aisle-app').hidden, true);
  // No fallback screen while the redirect is in flight.
  assert.equal(find('#auth-fallback'), null);
});

test('failed redirect shows a fallback screen with a retry button', async t => {
  let called = 0;
  const { Client, find } = setup(t, { loginWithRedirect: async () => { called++; throw new Error('offline'); } });
  await mountAuth({ config, Client, startChat });
  assert.equal(called, 1);
  assert.equal(find('#auth-fallback').hidden, false);
  assert.match(find('#auth-fallback-message').textContent, /could not be opened/i);
  find('#auth-fallback button').click();
  await settle();
  assert.equal(called, 2);
});

test('signed-in chat sends a bearer token, renders reply and isolates saved history', async t => {
  const { Client, find, dom } = setup(t, { isAuthenticated: async () => true });
  localStorage.setItem('aisle.conversations.v1.live.auth0%7Cbob', JSON.stringify({
    conversations: [{ id: 'private', title: 'Bob private chat', updatedAt: Date.now(), messages: [] }],
  }));
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, ...options };
    return new Response(JSON.stringify({ response: 'What size?', thread_id: 'saved-thread', title: 'Find Great Shoes' }));
  };
  await mountAuth({ config, Client, startChat });
  assert.equal(find('#aisle-app').hidden, false);
  assert.equal(find('#login-page'), null);
  assert.equal(find('#account-name').textContent, '<b>Alice</b>');
  assert.equal(find('#account-name b'), null);
  assert.equal(find('.history-item'), null);
  find('textarea').value = 'Find shoes';
  find('.composer').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await settle();
  assert.equal(request.headers.Authorization, 'Bearer test-access-token');
  assert.equal(JSON.parse(request.body).generate_title, true);
  assert.equal(find('.message.assistant p').textContent, 'What size?');
  assert.equal(find('.top-title').textContent, 'Find Great Shoes');
  const saved = localStorage.getItem('aisle.conversations.v1.live.auth0%7Calice');
  assert.equal(JSON.parse(saved).conversations[0].threadId, 'saved-thread');
  assert.equal(saved.includes('test-access-token'), false);
});

test('logout invokes Auth0 logout without a login page', async t => {
  let called = 0;
  const { Client, find } = setup(t, {
    isAuthenticated: async () => true,
    logout: async () => { called++; },
  });
  await mountAuth({ config, Client, startChat });
  find('#logout-button').click();
  await settle();
  assert.equal(called, 1);
  // The browser leaves for Auth0; no local login page is shown.
  assert.equal(find('#login-page'), null);
  assert.equal(find('#auth-fallback'), null);
});

test('expired session redirects to Universal Login and keeps the unanswered message', async t => {
  let called = 0;
  const { Client, find, dom } = setup(t, {
    isAuthenticated: async () => true,
    getTokenSilently: async () => { throw { error: 'login_required' }; },
    loginWithRedirect: async () => { called++; },
  });
  await mountAuth({ config, Client, startChat });
  find('textarea').value = 'Find shoes';
  find('.composer').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await settle();
  assert.equal(called, 1);
  const saved = JSON.parse(localStorage.getItem('aisle.conversations.v1.live.auth0%7Calice'));
  assert.equal(saved.conversations[0].messages[0].content, 'Find shoes');
});

test('expired session shows the login message when the redirect fails', async t => {
  const { Client, find, dom } = setup(t, {
    isAuthenticated: async () => true,
    getTokenSilently: async () => { throw { error: 'login_required' }; },
    loginWithRedirect: async () => { throw new Error('offline'); },
  });
  await mountAuth({ config, Client, startChat });
  find('textarea').value = 'Find shoes';
  find('.composer').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await settle();
  assert.equal(find('#aisle-app').hidden, true);
  assert.match(find('#auth-fallback-message').textContent, /log in again/i);
});
