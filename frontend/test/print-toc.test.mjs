import test from 'node:test';
import assert from 'node:assert/strict';
import { printTocHTML } from '../src/print-toc.js';

const h = (level, text, id = text) => ({ level, text, id });

test('short documents print without a contents page', () => {
  assert.equal(printTocHTML([], '目录'), '');
  assert.equal(printTocHTML([h(1, 'a'), h(2, 'b')], '目录'), '');
  assert.equal(printTocHTML([h(1, 'a'), h(2, ' '), h(2, '')], '目录'), '');
});

test('levels are counted from the top heading and stop after three', () => {
  const out = printTocHTML([h(2, 'a'), h(3, 'b'), h(4, 'c'), h(5, 'deep'), h(2, 'd')], '目录');
  assert.match(out, /<li class="toc-0"><a href="#a">a<\/a><\/li><li class="toc-1">/);
  assert.match(out, /class="toc-2"><a href="#c">c</);
  assert.doesNotMatch(out, /deep/);
});

test('heading text and ids cannot inject markup', () => {
  const out = printTocHTML(
    [h(1, '<img src=x onerror=alert(1)>', 'x"y'), h(1, 'a & b', '标题'), h(1, 'c')],
    'T<',
  );
  assert.doesNotMatch(out, /<img|"y/);
  assert.match(out, /&lt;img src=x/);
  assert.match(out, /href="#x%22y"/);
  assert.match(out, /href="#%E6%A0%87%E9%A2%98">a &amp; b</);
  assert.match(out, /<h2>T&lt;<\/h2>/);
});
