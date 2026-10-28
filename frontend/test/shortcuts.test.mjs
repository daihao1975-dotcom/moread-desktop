import test from 'node:test';
import assert from 'node:assert/strict';
import { shortcutKey, shortcutActions } from '../src/shortcuts.js';

const key = (k, mods = {}, code = '') => ({
  key: k,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  ...mods,
});

test('plain shortcuts need Cmd or Ctrl and no other modifier', () => {
  assert.equal(shortcutKey(key('s', { metaKey: true }), true), 's');
  assert.equal(shortcutKey(key('S', { ctrlKey: true }), false), 's');
  assert.equal(shortcutKey(key('s'), true), '');
  assert.equal(shortcutKey(key('b', { metaKey: true, altKey: true }), true), '');
  assert.equal(shortcutKey(key('x', { metaKey: true }), true), '');
  assert.equal(shortcutKey(key('s', { metaKey: true, isComposing: true }), true), '');
});

test('save as and replace follow each platform', () => {
  assert.equal(shortcutKey(key('S', { metaKey: true, shiftKey: true }), true), 'save-as');
  assert.equal(shortcutKey(key('ƒ', { metaKey: true, altKey: true }, 'KeyF'), true), 'replace');
  assert.equal(shortcutKey(key('h', { ctrlKey: true }), false), 'replace');
  assert.equal(shortcutKey(key('h', { metaKey: true }), true), '');
  assert.equal(shortcutKey(key('replace', { metaKey: true }), true), '');
});

test('every shortcut names an action', () => {
  for (const [k, action] of Object.entries(shortcutActions)) assert.ok(action, k);
});

test('Mac close and platform modifiers do not hijack Control editing shortcuts', () => {
  assert.equal(shortcutActions[shortcutKey(key('w', { metaKey: true }), true)], 'close-window');
  assert.equal(shortcutKey(key('w', { ctrlKey: true }), false), '');
  for (const k of ['w', 's', 'n', 'f', 'p', 'b', 'i', 'e']) {
    assert.equal(shortcutKey(key(k, { ctrlKey: true }), true), '');
    assert.equal(shortcutKey(key(k, { metaKey: true }), false), '');
  }
  assert.equal(shortcutKey(key('w', { metaKey: true, shiftKey: true }), true), '');
  assert.equal(shortcutKey(key('S', { metaKey: true, shiftKey: true, altKey: true }), true), '');
});

test('font size shortcuts accept the plus key on standard keyboards', () => {
  for (const [k, mods] of [
    ['=', {}],
    ['+', { shiftKey: true }],
  ]) {
    assert.equal(shortcutActions[shortcutKey(key(k, { metaKey: true, ...mods }), true)], 'font-bigger');
  }
  assert.equal(shortcutActions[shortcutKey(key('-', { metaKey: true }), true)], 'font-smaller');
  assert.equal(shortcutActions[shortcutKey(key('0', { metaKey: true }), true)], 'font-reset');
});
