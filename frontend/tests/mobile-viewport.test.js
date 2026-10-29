import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { bindMobileViewport } from '../mobile-viewport.js';

function emitter() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    emit(type) { listeners.get(type)?.(); },
  };
}

test('chat follows the visible viewport as the mobile keyboard opens and closes', () => {
  const dom = new JSDOM('<div id="aisle-app"></div>');
  const root = dom.window.document.getElementById('aisle-app');
  const visualViewport = Object.assign(emitter(), { height: 760, offsetTop: 0 });
  const media = Object.assign(emitter(), { matches: true });
  const win = Object.assign(emitter(), { visualViewport, innerHeight: 760, matchMedia: () => media });
  const unbind = bindMobileViewport(root, win);

  assert.equal(root.style.getPropertyValue('--aisle-viewport-height'), '760px');
  visualViewport.height = 390;
  visualViewport.offsetTop = 26;
  visualViewport.emit('resize');
  assert.equal(root.style.getPropertyValue('--aisle-viewport-height'), '390px');
  assert.equal(root.style.getPropertyValue('--aisle-viewport-top'), '26px');

  visualViewport.height = 760;
  visualViewport.offsetTop = 0;
  visualViewport.emit('resize');
  assert.equal(root.style.getPropertyValue('--aisle-viewport-height'), '760px');
  assert.equal(root.style.getPropertyValue('--aisle-viewport-top'), '0px');

  media.matches = false;
  media.emit('change');
  assert.equal(root.style.getPropertyValue('--aisle-viewport-height'), '');
  unbind();
  dom.window.close();
});

test('Home Screen launch requests standalone mode', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.match(html, /rel="manifest"/);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
});
