import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { setLanguage: useLanguage } = await import('../src/i18n.js');
useLanguage('zh-CN');
const { renderDocument, sanitize, getCSS, page } = await import('../src/render.js');
test('hostile raw HTML cannot create scripts, events, forms or network styles', () => {
  const s = sanitize(
    '<script>bad()</script><iframe src="https://example.com"></iframe><img src=x onerror=bad() srcset="https://example.com/a 2x"><span style="background:url(https://example.com)">ok</span><input name=x><form action="https://example.com"></form>',
  );
  assert.doesNotMatch(s, /<script|<iframe|onerror|srcset|style=|<input|<form/i);
});
test('rich syntax retains math layout, task checkboxes and safe HTML', async () => {
  const r = await renderDocument(
    '# 标题\n\n- [x] 完成\n\n$$\\frac{1}{2}+\\sqrt{x}$$\n\n<details><summary>说明</summary>正文</details>',
  );
  assert.match(r.body, /type="checkbox"[^>]*disabled|disabled[^>]*type="checkbox"/);
  assert.match(r.body, /katex/);
  assert.match(r.body, /style="height:/);
  assert.match(r.body, /<details>/);
  assert.equal(r.outline[0].text, '标题');
});
test('remote and forged local images are never automatically loaded', async () => {
  let calls = 0;
  const r = await renderDocument('![远程](https://example.com/a.png)\n\n![伪造](local.png)', {
    id: 'fixture',
    readImage: async () => {
      calls++;
      return 'https://example.com/x';
    },
  });
  assert.equal(calls, 1);
  assert.doesNotMatch(r.body, /<img/);
  assert.match(r.body, /远程图片已阻止/);
});
test('document directives cannot override mermaid security', async () => {
  const r = await renderDocument(
    '```mermaid\n%%{init: {securityLevel: "loose"}}%%\nflowchart LR\nA-->B\n```',
  );
  assert.match(r.body, /render-error/);
  assert.doesNotMatch(r.body, /<svg/);
});
test('every math font is embedded for offline snapshots', async () => {
  const css = await getCSS(true);
  assert.match(css, /data:font\/woff2;base64/);
  assert.doesNotMatch(css, /url\(fonts\//);
  const html = page('<p>离线</p>', css);
  assert.doesNotMatch(html, /<script|wails|bridge/);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /SIL OPEN FONT LICENSE Version 1.1/);
  assert.match(html, /Reserved Font Name KaTeX_Main/);
});
test('asynchronous outdated documents are discarded', async () => {
  const r = await renderDocument('![本地](a.png)', {
    id: 'fixture',
    readImage: async () => 'data:image/png;base64,AAAA',
    isCurrent: () => false,
  });
  assert.equal(r, null);
});

test('safe inline HTML wraps its actual text', async () => {
  const r = await renderDocument('按 <kbd>Ctrl</kbd>，<u>下划线</u>。');
  assert.match(r.body, /<kbd>Ctrl<\/kbd>/);
  assert.match(r.body, /<u>下划线<\/u>/);
});

test('offline snapshots preserve fluid and fixed selections without invalid CSS', () => {
  for (const [width, expected] of [
    ['auto', 'min\\(100%, 48em\\)'],
    [720, '720px'],
    [860, '860px'],
    [1040, '1040px'],
    ['bad', 'min\\(100%, 48em\\)'],
  ]) {
    const html = page('<p>content</p>', '', 'light', 19, width);
    assert.match(html, new RegExp('--content-width:' + expected));
    assert.doesNotMatch(html, /--content-width:(?:NaN|undefined)/);
    assert.match(html, /--font-size:19px/);
  }
});

test('documents without math skip KaTeX styles, fonts and the font license', async () => {
  const r = await renderDocument('# 标题\n\n正文');
  assert.equal(r.math, false);
  const css = await getCSS(r.math);
  assert.doesNotMatch(css, /data:font\/woff2|KaTeX_/);
  assert.doesNotMatch(page(r.body, css), /SIL OPEN FONT LICENSE/);
  const m = await renderDocument('价格 $x$');
  assert.equal(m.math, true);
});
test('alerts, copy buttons and placeholders follow the interface language', async () => {
  const { setLanguage } = await import('../src/i18n.js');
  try {
    setLanguage('en');
    const r = await renderDocument(
      '> [!WARNING]\n> careful\n\n```js\nx\n```\n\n![a](https://example.com/a.png)',
    );
    assert.match(r.body, /alert-title">Warning</);
    assert.match(r.body, />Copy<\/button>/);
    assert.match(r.body, /Remote image blocked/);
    setLanguage('ja');
    assert.match(page('<p>x</p>', ''), /<html lang="ja"/);
  } finally {
    setLanguage('zh-CN');
  }
});

test('readable preview arrives before image I/O and math enrichment', async () => {
  let release;
  const image = new Promise(resolve => {
    release = resolve;
  });
  const previews = [];
  let reading = false;
  const rendering = renderDocument('# First content\n\n$1+2$\n\n![local](test.png)', {
    id: 'synthetic',
    onPreview: async preview => {
      previews.push(preview);
    },
    readImage: async () => {
      reading = true;
      return image;
    },
  });
  // Wait until the final pass is blocked on the image, rather than timing a machine-dependent delay.
  while (!reading) await new Promise(resolve => setImmediate(resolve));
  assert.equal(previews.length, 1);
  assert.match(previews[0].body, /First content/);
  assert.doesNotMatch(previews[0].body, /<img|katex/);
  assert.equal(previews[0].math, false);
  release('data:image/png;base64,AAAA');
  const final = await rendering;
  assert.match(final.body, /katex/);
  assert.match(final.body, /data:image\/png;base64,AAAA/);
});

test('cancellation after preview prevents enrichment and stale results', async () => {
  let current = true,
    reads = 0;
  const result = await renderDocument('# New\n\n![local](test.png)', {
    id: 'synthetic',
    isCurrent: () => current,
    onPreview: async () => {
      current = false;
    },
    readImage: async () => {
      reads++;
      return '';
    },
  });
  assert.equal(result, null);
  assert.equal(reads, 0);
});

test('deferred preview preserves script isolation and blocks remote resources', async () => {
  const preview = await renderDocument(
    '# Safe\n<script>bad()</script>\n<img src="https://example.com/x" onerror="bad()">\n\n```mermaid\nflowchart LR\nA-->B\n```',
    {
      deferred: true,
      readImage: async () => {
        throw Error('must not read');
      },
    },
  );
  assert.match(preview.body, /Safe/);
  assert.match(preview.body, /mermaid-source/);
  assert.doesNotMatch(preview.body, /<script|<img|onerror|<svg/);
});

test('lazy code highlighter keeps final syntax highlighting and previews plain', async () => {
  const source = '```javascript\nconst answer = 42;\n```';
  const preview = await renderDocument(source, { deferred: true });
  assert.doesNotMatch(preview.body, /hljs-keyword/);
  const final = await renderDocument(source);
  assert.match(final.body, /hljs-keyword/);
  assert.match(final.body, /answer/);
});

test('heading IDs stay unique when numbered slugs and raw HTML IDs collide', async () => {
  const r = await renderDocument('<span id="a">target</span>\n\n# A\n\n# A\n\n# A-1\n\n# A');
  const host = document.createElement('div');
  host.innerHTML = r.body;
  const ids = [...host.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    r.outline.map(h => h.id),
    ['a-1', 'a-2', 'a-1-1', 'a-3'],
  );
});

test('duplicate images share reads within a render but refresh on the next render', async () => {
  let calls = 0;
  let uri = 'data:image/png;base64,AAAA';
  const options = {
    id: 'doc',
    readImage: async () => {
      calls++;
      return uri;
    },
  };
  const source = '![first](image.png) ![again](image.png)';
  let result = await renderDocument(source, options);
  assert.equal(calls, 1);
  assert.equal((result.body.match(/data:image\/png;base64,AAAA/g) || []).length, 2);
  uri = 'data:image/png;base64,BBBB';
  result = await renderDocument(source, options);
  assert.equal(calls, 2);
  assert.equal((result.body.match(/data:image\/png;base64,BBBB/g) || []).length, 2);
});

test('duplicate images still count towards the serialized document budget', async () => {
  let calls = 0;
  const uri = 'data:image/png;base64,' + 'A'.repeat(17 * 1024 * 1024);
  const result = await renderDocument('![first](a.png) ![second](a.png)', {
    id: 'doc',
    readImage: async () => {
      calls++;
      return uri;
    },
  });
  assert.equal(calls, 1);
  const host = document.createElement('div');
  host.innerHTML = result.body;
  assert.equal(host.querySelectorAll('img').length, 1);
  assert.equal(host.querySelectorAll('.image-placeholder').length, 1);
});
