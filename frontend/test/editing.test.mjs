import test from 'node:test';
import assert from 'node:assert/strict';
import {
  continueList,
  indentLines,
  wrapSelection,
  insertLink,
  findAll,
  replaceAll,
  countWords,
} from '../src/editing.js';
const apply = (v, c) => v.slice(0, c.start) + c.text + v.slice(c.end);
test('Enter continues bullet, numbered, task and quote lines', () => {
  for (const [line, next] of [
    ['- 苹果', '- '],
    ['  * item', '  * '],
    ['9. 九', '10. '],
    ['3) x', '4) '],
    ['- [x] done', '- [ ] '],
    ['> 引用', '> '],
  ]) {
    const c = continueList(line, line.length);
    assert.equal(apply(line, c), line + '\n' + next);
    assert.deepEqual(c.select, [line.length + 1 + next.length, line.length + 1 + next.length]);
  }
  assert.equal(continueList('plain text', 10), null);
  assert.equal(continueList('- abc', 1), null);
});
test('Enter on an empty item ends the list instead of adding another', () => {
  const v = '- a\n- ';
  const c = continueList(v, v.length);
  assert.equal(apply(v, c), '- a\n');
  assert.deepEqual(c.select, [4, 4]);
});
test('Tab nests a list item under its sibling text and Shift+Tab returns it', () => {
  const v = '1. one\n2. two';
  let c = indentLines(v, v.length, v.length);
  let out = apply(v, c);
  assert.equal(out, '1. one\n   1. two');
  assert.deepEqual(c.select, [out.length, out.length]);
  c = indentLines(out, out.length, out.length, true);
  assert.equal(apply(out, c), '1. one\n2. two');
  const b = '- a\n- b';
  assert.equal(apply(b, indentLines(b, b.length, b.length)), '- a\n  - b');
});
test('Tab inserts two spaces in plain text and shifts every selected line', () => {
  assert.equal(apply('ab', indentLines('ab', 1, 1)), 'a  b');
  const v = 'x\ny\nz';
  const c = indentLines(v, 0, v.length);
  assert.equal(apply(v, c), '  x\n  y\n  z');
  assert.equal(apply(apply(v, c), indentLines(apply(v, c), 0, c.text.length, true)), v);
});
test('wrapping toggles marks and leaves a placeholder selected when nothing is selected', () => {
  const c = wrapSelection('say hi', 4, 6, '**', '粗体');
  assert.equal(apply('say hi', c), 'say **hi**');
  const back = wrapSelection('say **hi**', 6, 8, '**', '粗体');
  assert.equal(apply('say **hi**', back), 'say hi');
  const empty = wrapSelection('', 0, 0, '`', 'code');
  assert.equal(apply('', empty), '`code`');
  assert.deepEqual(empty.select, [1, 5]);
  const link = insertLink('go', 0, 2, 'text');
  assert.equal(apply('go', link), '[go](https://)');
  assert.deepEqual(link.select, [5, 13]);
});
test('find and replace all are literal and case-insensitive', () => {
  assert.deepEqual(findAll('Aa a.A', 'a'), [0, 1, 3, 5]);
  assert.deepEqual(findAll('a.b', '.'), [1]);
  assert.deepEqual(findAll('aaaa', 'a', 2), [0, 1]);
  assert.deepEqual(replaceAll('Cat cat CAT', 'cat', 'dog'), { text: 'dog dog dog', count: 3 });
  assert.deepEqual(replaceAll('x', 'y', 'z'), { text: 'x', count: 0 });
});
test('word count treats CJK characters and Latin words as words', () => {
  assert.deepEqual(countWords(''), { words: 0, minutes: 0 });
  assert.equal(countWords('墨阅 MoRead is light.').words, 5);
  assert.equal(countWords('一'.repeat(800)).minutes, 2);
});
