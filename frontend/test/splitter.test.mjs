import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applySplitLayout, bindSplitter } from '../src/splitter.js';

function setup(t, previewOnLeft = false) {
  const { window } = new JSDOM('<main class="split"><div role="separator"></div></main>');
  t.after(() => window.close());
  const area = window.document.querySelector('main');
  const splitter = area.firstElementChild;
  const prefs = { split: 50, previewOnLeft };
  let commits = 0;
  const captured = new Set();
  splitter.setPointerCapture = id => captured.add(id);
  splitter.hasPointerCapture = id => captured.has(id);
  splitter.releasePointerCapture = id => captured.delete(id);
  area.getBoundingClientRect = () => ({ left: 100, width: 1000 });
  applySplitLayout(area, splitter, prefs);
  bindSplitter(splitter, area, {
    get: () => prefs.split,
    set: split => {
      prefs.split = split;
    },
    commit: () => {
      commits++;
    },
  });
  const pointer = (name, clientX, button = 0) => {
    const event = new window.MouseEvent(name, { clientX, button, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    splitter.dispatchEvent(event);
  };
  return { window, area, splitter, prefs, pointer, commits: () => commits };
}

test('swapping sides keeps the chosen left width and updates accessibility bounds', t => {
  const { area, splitter, prefs } = setup(t);
  prefs.split = 70;
  prefs.previewOnLeft = true;
  applySplitLayout(area, splitter, prefs);
  assert.equal(area.classList.contains('preview-left'), true);
  assert.equal(area.style.getPropertyValue('--split'), '70%');
  assert.equal(splitter.getAttribute('aria-valuenow'), '70');
  assert.equal(splitter.getAttribute('aria-valuemin'), '20');
  assert.equal(splitter.getAttribute('aria-valuemax'), '80');
  prefs.previewOnLeft = false;
  applySplitLayout(area, splitter, prefs);
  assert.equal(area.classList.contains('preview-left'), false);
  assert.equal(prefs.split, 70);
});

for (const reversed of [false, true]) {
  test(`dragging adjusts the physical left pane with previewOnLeft=${reversed}`, t => {
    const { window, splitter, prefs, pointer, commits } = setup(t, reversed);
    pointer('pointerdown', 600);
    pointer('pointermove', 800);
    assert.equal(prefs.split, 70);
    assert.equal(splitter.getAttribute('aria-valuenow'), '70');
    pointer('pointermove', 2000);
    assert.equal(prefs.split, 80);
    pointer('pointerup', 2000);
    assert.equal(commits(), 1);
    assert.equal(window.document.body.classList.contains('resizing'), false);
    pointer('pointermove', 200);
    assert.equal(prefs.split, 80);
  });
}

test('keyboard arrows and double-click adjust and reset the left width', t => {
  const { window, splitter, prefs, commits } = setup(t, true);
  splitter.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
  assert.equal(prefs.split, 45);
  splitter.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
  assert.equal(prefs.split, 50);
  prefs.split = 78;
  splitter.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
  assert.equal(prefs.split, 80);
  splitter.dispatchEvent(new window.MouseEvent('dblclick'));
  assert.equal(prefs.split, 50);
  assert.equal(commits(), 4);
});

test('non-primary pointer buttons do not start resizing', t => {
  const { window, prefs, pointer } = setup(t);
  pointer('pointerdown', 600, 2);
  pointer('pointermove', 800, 2);
  assert.equal(prefs.split, 50);
  assert.equal(window.document.body.classList.contains('resizing'), false);
});
