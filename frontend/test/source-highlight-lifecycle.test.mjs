import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createSourceHighlight, HIGHLIGHT_LIMIT } from '../src/source-highlight.js';

function setup(t) {
  const { window } = new JSDOM('<main><textarea></textarea><div aria-hidden="true"></div></main>');
  const area = window.document.querySelector('main');
  const ed = area.querySelector('textarea');
  const layer = area.querySelector('div');
  const saved = { ResizeObserver: globalThis.ResizeObserver, getComputedStyle: globalThis.getComputedStyle };
  let resize;
  globalThis.ResizeObserver = class {
    constructor(callback) {
      resize = callback;
    }
    observe(target) {
      assert.equal(target, ed);
    }
  };
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  t.after(() => {
    Object.assign(globalThis, saved);
    window.close();
  });
  const metrics = { offsetLeft: 12, offsetTop: 8, clientWidth: 480, clientHeight: 300 };
  for (const key of Object.keys(metrics)) Object.defineProperty(ed, key, { get: () => metrics[key] });
  const fire = name => ed.dispatchEvent(new window.Event(name));
  const highlighter = createSourceHighlight(ed, layer, area);
  return { ed, layer, area, fire, highlighter, metrics, resize: () => resize() };
}

test('input and programmatic replacements keep the coloured copy current without changing selection', t => {
  const { ed, layer, area, fire, highlighter } = setup(t);
  ed.value = '# 中文 & <script>alert(1)</script>';
  ed.setSelectionRange(2, 4);
  fire('input');
  assert.equal(area.classList.contains('highlighting'), true);
  assert.equal(layer.textContent, ed.value);
  assert.equal(layer.querySelector('script'), null);
  assert.deepEqual([ed.selectionStart, ed.selectionEnd], [2, 4]);
  ed.value = 'new document';
  highlighter.refresh();
  assert.equal(layer.textContent, 'new document');
  assert.equal(layer.getAttribute('aria-hidden'), 'true');
});

test('scrolling and resize track editor viewport metrics including scrollbar width', t => {
  const { ed, layer, fire, metrics, resize, highlighter } = setup(t);
  ed.value = '# title';
  ed.style.padding = '16px 24px';
  highlighter.refresh();
  assert.equal(layer.style.left, '12px');
  assert.equal(layer.style.width, '480px');
  assert.equal(layer.style.paddingTop, '16px');
  assert.equal(layer.style.paddingRight, '24px');
  ed.scrollTop = 140;
  ed.scrollLeft = 19;
  fire('scroll');
  assert.equal(layer.scrollTop, 140);
  assert.equal(layer.scrollLeft, 19);
  metrics.clientWidth = 300;
  metrics.clientHeight = 220;
  resize();
  assert.equal(layer.style.width, '300px');
  assert.equal(layer.style.height, '220px');
});

test('composition preserves the native editor and refreshes the copy after committing Chinese input', t => {
  const { ed, layer, area, fire } = setup(t);
  ed.value = '# 中';
  fire('compositionstart');
  assert.equal(area.classList.contains('composing'), true);
  ed.value = '# 中文';
  fire('input');
  assert.equal(area.classList.contains('composing'), true);
  fire('compositionend');
  assert.equal(area.classList.contains('composing'), false);
  assert.equal(layer.textContent, '# 中文');
  assert.equal(ed.value, '# 中文');
});

test('long documents release the copy and return to highlighting when shortened', t => {
  const { ed, layer, area, highlighter } = setup(t);
  ed.value = '# title';
  highlighter.refresh();
  assert.equal(layer.children.length, 1);
  ed.value = 'x'.repeat(HIGHLIGHT_LIMIT + 1);
  highlighter.refresh();
  assert.equal(area.classList.contains('highlighting'), false);
  assert.equal(layer.textContent, '');
  assert.equal(ed.value.length, HIGHLIGHT_LIMIT + 1);
  ed.value = '*短文*';
  highlighter.refresh();
  assert.equal(area.classList.contains('highlighting'), true);
  assert.equal(layer.textContent, '*短文*');
});
