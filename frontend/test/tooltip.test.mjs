import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { bindTooltips } from '../src/tooltip.js';
const tick = ms => new Promise(r => setTimeout(r, ms));
function setup() {
  const dom = new JSDOM(
    '<!doctype html><body><button id="a" data-tip="打开文件 (⌘O)">A</button><button id="b">B</button></body>',
  );
  const doc = dom.window.document;
  const tips = bindTooltips(doc, { delay: 5 });
  const fire = (type, el, extra = {}) =>
    el.dispatchEvent(new dom.window.Event(type, { bubbles: true, ...extra }));
  return { dom, doc, tips, fire, tip: doc.querySelector('.tooltip') };
}
test('hovering a hinted control shows its hint after a short delay and links it for assistive technology', async () => {
  const { doc, fire, tip } = setup();
  const a = doc.querySelector('#a');
  fire('pointerover', a);
  assert.equal(tip.hidden, true);
  await tick(20);
  assert.equal(tip.hidden, false);
  assert.equal(tip.textContent, '打开文件 (⌘O)');
  assert.equal(a.getAttribute('aria-describedby'), tip.id);
  assert.equal(tip.getAttribute('role'), 'tooltip');
});
test('leaving, pressing or controls without hints never leave a stale tooltip', async () => {
  const { doc, fire, tip } = setup();
  const a = doc.querySelector('#a');
  fire('pointerover', a);
  await tick(20);
  fire('pointerdown', a);
  assert.equal(tip.hidden, true);
  assert.equal(a.hasAttribute('aria-describedby'), false);
  fire('pointerover', doc.querySelector('#b'));
  await tick(20);
  assert.equal(tip.hidden, true);
  fire('pointerover', a);
  fire('pointerout', a);
  await tick(20);
  assert.equal(tip.hidden, true);
});
