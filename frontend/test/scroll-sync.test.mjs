import test from 'node:test';
import assert from 'node:assert/strict';
import { locate, place, sourceHeadingLines } from '../src/scroll-sync.js';

test('headings inside fenced code are ignored', () => {
  const lines = [
    '# A',
    '```',
    '# not a heading',
    '~~~',
    '```',
    'text',
    '   ## B',
    '#tag',
    '~~~md',
    '# C',
    '~~~',
    '###',
  ];
  assert.deepEqual(sourceHeadingLines(lines), [0, 6, 11]);
});

test('locate and place are inverse within a section', () => {
  const tops = [100, 300, 700],
    max = 1000;
  assert.deepEqual(locate(tops, 50, max), { section: -1, progress: 0.5 });
  assert.deepEqual(locate(tops, 400, max), { section: 1, progress: 0.25 });
  for (const y of [0, 99, 100, 250, 699, 700, 999, 1000]) {
    const at = locate(tops, y, max);
    assert.equal(Math.round(place(tops, at.section, at.progress, max)), y);
  }
});

test('locate clamps past the last heading and handles empty sections', () => {
  assert.deepEqual(locate([0, 0], 0, 0), { section: 1, progress: 0 });
  assert.equal(locate([100], 2000, 1000).progress, 1);
});
