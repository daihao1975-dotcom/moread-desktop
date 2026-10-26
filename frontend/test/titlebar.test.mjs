import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { bindTitlebar } from '../src/titlebar.js';

test('titlebar double-click toggles maximise and restore, including document title', () => {
  const { window } = new JSDOM('<header><div><span>document.md</span></div></header>');
  const bar = window.document.querySelector('header');
  let maximised = false,
    calls = 0;
  bindTitlebar(bar, {
    WindowToggleMaximise() {
      maximised = !maximised;
      calls++;
    },
  });
  const doubleClick = target =>
    target.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 }));
  assert.equal(doubleClick(bar), false);
  assert.equal(maximised, true);
  assert.equal(doubleClick(bar.querySelector('span')), false);
  assert.equal(maximised, false);
  assert.equal(calls, 2);
});

test('titlebar controls and non-primary clicks never resize the window', () => {
  const { window } = new JSDOM(
    '<header><button><svg><path/></svg></button><input><select></select><textarea></textarea><a><span>link</span></a><div role="button"><b>action</b></div><div contenteditable><i>edit</i></div></header>',
  );
  const bar = window.document.querySelector('header');
  let calls = 0;
  bindTitlebar(bar, {
    WindowToggleMaximise() {
      calls++;
    },
  });
  for (const target of bar.querySelectorAll('*'))
    target.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, button: 0 }));
  bar.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, button: 2 }));
  bar.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
  assert.equal(calls, 0);
});

test('browser preview remains usable without native runtime', () => {
  const { window } = new JSDOM('<header></header>');
  const bar = window.document.querySelector('header');
  bindTitlebar(bar, undefined);
  assert.equal(
    bar.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true })),
    true,
  );
});
