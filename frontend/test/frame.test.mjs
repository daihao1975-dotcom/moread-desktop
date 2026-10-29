import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import config from '../vite.config.js';
import { createFrame } from '../src/frame.js';
function setup() {
  const dom = new JSDOM('<!doctype html><iframe></iframe>', { url: 'https://app.example.test/' });
  globalThis.document = dom.window.document;
  globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
  const el = document.querySelector('iframe');
  const actions = [],
    sent = [];
  const positions = [];
  const frame = createFrame(el, { onAction: a => actions.push(a), onPosition: p => positions.push(p) });
  const token = el.srcdoc.match(/nonce="([a-f0-9]+)"/)[1];
  const incoming = (type, payload = {}, version = 1, extra = {}) =>
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        source: el.contentWindow,
        origin: 'null',
        data: { channel: 'moread-frame-v1', token, version, type, ...payload },
        ...extra,
      }),
    );
  el.contentWindow.postMessage = m => {
    sent.push(m);
    const result =
      m.type === 'render' ? { empty: false, images: (m.body.match(/<img\b/gi) || []).length } : {};
    incoming('ack', { request: m.request, command: m.type, result }, m.version);
  };
  return { dom, el, frame, token, actions, sent, incoming, positions };
}
test('parent CSP authorizes exact fixed bootstrap hash without unsafe-inline', () => {
  const input = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../src/frame-bootstrap.js', import.meta.url), 'utf8');
  const html = config.plugins[0].transformIndexHtml(input);
  assert.ok(html.includes("'sha256-" + createHash('sha256').update(script).digest('base64') + "'"));
  assert.doesNotMatch(html, /script-src[^;]*unsafe-inline/);
});
test('opaque frame exposes only current indexed actions and strips navigation', async () => {
  const t = setup();
  t.frame.begin(1);
  t.incoming('ready', {}, 0);
  await t.frame.render(
    '<a href="https://example.test/doc" target="_top" ping="https://example.test/track">link</a><pre><button class="copy-code">复制</button><code>safe code</code></pre>',
    '',
  );
  assert.equal(t.el.getAttribute('sandbox'), 'allow-scripts');
  assert.doesNotMatch(t.el.srcdoc, /example\.test\/doc/);
  const body = t.sent.find(m => m.type === 'render').body;
  assert.doesNotMatch(body, /href=|target=|ping=/);
  assert.match(body, /data-moread-action="1"/);
  t.incoming('action', { id: 1 });
  assert.equal(t.actions.length, 1);
  assert.equal(t.actions[0].value, 'https://example.test/doc');
  t.incoming('action', { id: 99 });
  t.incoming('action', { id: 1 }, 0);
  t.incoming('action', { id: 1 }, 1, { origin: 'https://evil.example.test' });
  t.incoming('action', { id: 1 }, 1, { source: t.dom.window });
  t.incoming('action', { id: 1, unknown: true });
  assert.equal(t.actions.length, 1);
  t.frame.begin(2);
  t.incoming('action', { id: 1 });
  assert.equal(t.actions.length, 1);
  t.dom.window.close();
});
test('render waiting for initial ready cannot acquire a later version', async () => {
  const t = setup();
  t.frame.begin(1);
  const old = t.frame.render('<p>old</p>', '');
  t.frame.begin(2);
  const fresh = t.frame.render('<p>fresh</p>', '');
  t.incoming('ready', {}, 0);
  assert.equal((await old).cancelled, true);
  await fresh;
  const renders = t.sent.filter(m => m.type === 'render');
  assert.equal(renders.length, 1);
  assert.equal(renders[0].version, 2);
  assert.match(renders[0].body, /fresh/);
  assert.doesNotMatch(renders[0].body, /old/);
  t.dom.window.close();
});
test('129 legitimate small images use their actual expected count', async () => {
  const t = setup();
  t.frame.begin(1);
  t.incoming('ready', {}, 0);
  const result = await t.frame.render('<img src="data:image/png;base64,AAAA">'.repeat(129), '');
  assert.equal(result.images, 129);
  t.dom.window.close();
});

test('reading position accepts only bounded ratios and known headings', async () => {
  const t = setup();
  t.frame.begin(1);
  t.incoming('ready', {}, 0);
  await t.frame.render('<h2 id="start">Start</h2><p>x</p>', '');
  const at = (ratio, heading, section, progress) => ({ ratio, heading, section, progress });
  t.incoming('position', at(2500, 'start', 0, 5000));
  t.incoming('position', at(0, '', -1, 0));
  t.incoming('position', at(10001, '', -1, 0));
  t.incoming('position', at(10, 'missing', 0, 0));
  t.incoming('position', at(10, 'start', -2, 0));
  t.incoming('position', at(10, 'start', 0, 10001));
  t.incoming('position', { ...at(10, 'start', 0, 0), extra: 1 });
  t.incoming('position', at(10, 'start', 0, 0), 0);
  assert.deepEqual(t.positions, [
    { ratio: 0.25, heading: 'start', section: 0, progress: 0.5 },
    { ratio: 0, heading: '', section: -1, progress: 0 },
  ]);
  t.dom.window.close();
});
test('editor scroll sync sends a clamped integer ratio only for the current render', async () => {
  const t = setup();
  t.frame.begin(1);
  t.incoming('ready', {}, 0);
  await t.frame.scrollTo(0.5);
  assert.equal(t.sent.filter(m => m.type === 'scroll').length, 0);
  await t.frame.render('<p>x</p>', '');
  await t.frame.scrollTo(0.5);
  await t.frame.scrollTo(7, 3);
  await t.frame.scrollTo(NaN);
  await t.frame.scrollTo(0.5, -3);
  assert.deepEqual(
    t.sent.filter(m => m.type === 'scroll').map(m => [m.ratio, m.section]),
    [
      [5000, -2],
      [10000, 3],
    ],
  );
  t.dom.window.close();
});

test('paint timing rejects invalid acknowledgements and cancels stale requests', async () => {
  const t = setup();
  t.frame.begin(1);
  t.incoming('ready', {}, 0);
  t.el.contentWindow.postMessage = m => {
    t.sent.push(m);
    t.incoming(
      'ack',
      { request: m.request, command: m.type, result: { firstContentfulPaintAt: -1 } },
      m.version,
    );
    t.incoming(
      'ack',
      { request: m.request, command: m.type, result: { firstContentfulPaintAt: 123 } },
      m.version,
    );
  };
  assert.deepEqual(await t.frame.paintTiming(), { firstContentfulPaintAt: 123 });
  t.el.contentWindow.postMessage = () => {};
  const old = t.frame.paintTiming();
  await new Promise(resolve => setImmediate(resolve));
  t.frame.begin(2);
  assert.equal((await old).cancelled, true);
  t.dom.window.close();
});

test('preview Unicode search preserves text and original match offsets', () => {
  const dom = new JSDOM(
    '<style></style><article><p>İ ABC i\u0307X [a].*</p></article><script nonce="test"></script>',
    { runScripts: 'outside-only' },
  );
  const { window } = dom;
  Object.defineProperty(window.document, 'currentScript', { value: window.document.querySelector('script') });
  window.postMessage = () => {};
  window.eval(readFileSync(new URL('../src/frame-bootstrap.js', import.meta.url), 'utf8'));
  const article = window.document.querySelector('article');
  const original = article.textContent;
  for (const [query, matches] of [
    ['abc', ['ABC']],
    ['İ', ['İ']],
    ['[A].*', ['[a].*']],
  ]) {
    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        data: {
          channel: 'moread-host-v1',
          token: 'test',
          version: 0,
          request: 1,
          type: 'find',
          query,
          move: false,
        },
      }),
    );
    assert.deepEqual(
      [...article.querySelectorAll('mark')].map(m => m.textContent),
      matches,
    );
    assert.equal(article.textContent, original);
  }
  dom.window.close();
});

test('text-only selection paint preserves native rich selections and clears when deselected', () => {
  const dom = new JSDOM(
    '<style></style><article><h2>Heading</h2><ol><li>First <strong>bold</strong> item</li><li>Second item</li></ol></article><script nonce="test"></script>',
    { runScripts: 'outside-only' },
  );
  const { window } = dom;
  Object.defineProperty(window.document, 'currentScript', { value: window.document.querySelector('script') });
  window.postMessage = () => {};
  window.CSS = { highlights: new Map() };
  window.Highlight = class extends Set {};
  window.eval(readFileSync(new URL('../src/frame-bootstrap.js', import.meta.url), 'utf8'));
  const article = window.document.querySelector('article');
  const original = article.innerHTML;
  const selection = window.getSelection();
  const range = window.document.createRange();
  range.setStart(article.querySelector('li').firstChild, 2);
  range.setEnd(article.querySelectorAll('li')[1].firstChild, 6);
  selection.addRange(range);
  window.document.dispatchEvent(new window.Event('selectionchange'));
  const highlight = window.CSS.highlights.get('moread-selection');
  assert.equal(window.document.documentElement.classList.contains('text-selection'), true);
  assert.equal(highlight.size, 1);
  assert.equal([...highlight][0].toString(), selection.toString());
  assert.equal([...highlight][0].startOffset, 2);
  assert.equal([...highlight][0].endOffset, 6);
  assert.notEqual([...highlight][0], range);
  assert.equal(selection.getRangeAt(0), range);
  assert.equal(article.innerHTML, original);
  assert.equal(range.cloneContents().querySelector('strong').textContent, 'bold');
  selection.removeAllRanges();
  window.document.dispatchEvent(new window.Event('selectionchange'));
  assert.equal(highlight.size, 0);
  dom.window.close();
});

test('older webviews retain visible native selection when custom highlights are unavailable', () => {
  const dom = new JSDOM('<style></style><article>Readable text</article><script nonce="test"></script>', {
    runScripts: 'outside-only',
  });
  const { window } = dom;
  Object.defineProperty(window.document, 'currentScript', { value: window.document.querySelector('script') });
  window.postMessage = () => {};
  window.eval(readFileSync(new URL('../src/frame-bootstrap.js', import.meta.url), 'utf8'));
  assert.equal(window.document.documentElement.classList.contains('text-selection'), false);
  dom.window.close();
});
