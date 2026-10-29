import assert from 'node:assert/strict';
import { test } from 'node:test';
import config from '../vite.config.js';

test('proxies API routes without intercepting the api.js frontend module', () => {
  for (const mode of ['server', 'preview']) {
    const [pattern, proxy] = Object.entries(config[mode].proxy)[0];
    assert.equal(new RegExp(pattern).test('/api/chat'), true);
    assert.equal(new RegExp(pattern).test('/api.js'), false);
    assert.equal(proxy.rewrite('/api/chat'), '/chat');
  }
});
