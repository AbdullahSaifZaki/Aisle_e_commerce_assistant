import assert from 'node:assert/strict';
import { test } from 'node:test';
import defineConfig from '../vite.config.js';
const config = defineConfig({ command: 'serve', mode: 'development' });

test('proxies API routes without intercepting the api.js frontend module', () => {
  for (const mode of ['server', 'preview']) {
    const [pattern, proxy] = Object.entries(config[mode].proxy)[0];
    assert.equal(new RegExp(pattern).test('/api/chat'), true);
    assert.equal(new RegExp(pattern).test('/api.js'), false);
    assert.equal(proxy.rewrite('/api/chat'), '/chat');
  }
});


test('production builds require an explicit HTTPS API endpoint', () => {
  const previous = process.env.VITE_API_URL;
  try {
    process.env.VITE_API_URL = '/api/chat';
    assert.throws(() => defineConfig({ command: 'build', mode: 'production' }), /HTTPS backend/);
    process.env.VITE_API_URL = 'https://backend.example.com/chat';
    assert.doesNotThrow(() => defineConfig({ command: 'build', mode: 'production' }));
  } finally {
    if (previous === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = previous;
  }
});
