import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightMarkdown } from '../src/source-highlight.js';

const plain = html =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const kinds = html =>
  [...html.matchAll(/<span class="md-(\w+)">([^<]*)<\/span>/g)].map(m => m[1] + ':' + plain(m[2]));

test('the coloured copy keeps every character of the source', () => {
  const src = [
    '---',
    'title: a & b',
    '---',
    '# 标题 <b>',
    '> - [x] **粗** *斜* `code` [链接](a.md "t") ![图](x.png) <br>',
    '```js',
    'if (a < b && c) {}',
    '```',
    '\t1. item',
    '',
  ].join('\n');
  const html = highlightMarkdown(src);
  assert.equal(plain(html), src + ' ');
  assert.doesNotMatch(html.replace(/<\/?span[^>]*>/g, ''), /<(?!\/?span)/);
});

test('block structure is coloured line by line', () => {
  const html = highlightMarkdown('---\na: 1\n---\n# 标题\n***\n> 引用\n- [ ] 待办\n10) 第十\n#标签\n');
  assert.deepEqual(kinds(html), [
    'meta:---',
    'meta:a: 1',
    'meta:---',
    'heading:# 标题',
    'mark:***',
    'mark:> ',
    'mark:- [ ]',
    'mark:10)',
  ]);
});

test('fenced code ends only at a matching fence', () => {
  const html = highlightMarkdown('````\n```\n# 不是标题\n````\n# 标题');
  assert.deepEqual(kinds(html), ['code:````', 'code:```', 'code:# 不是标题', 'code:````', 'heading:# 标题']);
  assert.deepEqual(kinds(highlightMarkdown('~~~\n```\n~~~')), ['code:~~~', 'code:```', 'code:~~~']);
  // Backticks after an opening fence make it inline code, not a block.
  assert.deepEqual(kinds(highlightMarkdown('```a``` b\n# 标题')), ['code:```a```', 'heading:# 标题']);
});

test('inline marks cover only real spans', () => {
  const html = highlightMarkdown('**粗** *斜* __粗__ `a*b*` [文](u) 2 * 3 * 4 snake_case_name');
  assert.deepEqual(kinds(html), ['strong:**粗**', 'em:*斜*', 'strong:__粗__', 'code:`a*b*`', 'link:[文](u)']);
  assert.deepEqual(kinds(highlightMarkdown('<span>x</span> a < b')), ['tag:<span>', 'tag:</span>']);
});

test('a front matter opener without a closer is ordinary text', () => {
  assert.deepEqual(kinds(highlightMarkdown('---\n# 标题')), ['mark:---', 'heading:# 标题']);
});
