import test from 'node:test';
import assert from 'node:assert/strict';
import { readLineEndings, editLineEndings, writeLineEndings } from '../src/line-endings.js';

test('unchanged mixed, CR-only, uniform and empty documents round-trip exactly', () => {
  for (const original of ['', 'a', 'a\r\nb\nc\r', 'a\rb\r', 'a\nb\n', 'a\r\nb\r\n']) {
    const { text, endings, preferred } = readLineEndings(original);
    assert.equal(writeLineEndings(text, endings, preferred), original);
    assert.doesNotMatch(text, /\r/);
  }
});

test('editing a line preserves delimiters on both sides and new lines follow the document', () => {
  const original = 'one\r\ntwo\nthree\rfour';
  const { text, endings, preferred } = readLineEndings(original);
  for (const [next, expected] of [
    ['one\nTWO\nthree\nfour', 'one\r\nTWO\nthree\rfour'],
    ['ONE\ntwo\nthree\nFOUR', 'ONE\r\ntwo\nthree\rFOUR'],
    ['one\ntwo\nNEW\nthree\nfour', 'one\r\ntwo\nNEW\r\nthree\rfour'],
    ['one\nthree\nfour', 'one\r\nthree\rfour'],
    ['', ''],
    ['one\ntwo\nthree\nfour\n', original + '\r\n'],
  ]) {
    const updated = editLineEndings(text, next, endings, preferred);
    assert.equal(writeLineEndings(next, updated, preferred), expected);
  }
});
