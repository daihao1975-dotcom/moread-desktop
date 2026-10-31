import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadingPositions, readPositions, POSITION_LIMIT } from '../src/reading-positions.js';
const at = (section, progress, ratio) => ({ section, progress, ratio });
const store = (initial = []) => {
  const box = { saved: initial, saves: 0 };
  box.positions = createReadingPositions({
    load: () => box.saved,
    save: list => {
      box.saved = JSON.parse(JSON.stringify(list));
      box.saves++;
    },
    delay: 10_000,
  });
  return box;
};
test('a remembered position survives a restart', () => {
  const a = store();
  a.positions.remember('doc', at(3, 0.25, 0.4));
  a.positions.flush();
  assert.deepEqual(store(a.saved).positions.get('doc'), at(3, 0.25, 0.4));
});
test('writes are batched until flushed', () => {
  const a = store();
  a.positions.remember('doc', at(1, 0.1, 0.2));
  a.positions.remember('doc', at(2, 0.1, 0.3));
  assert.equal(a.saves, 0);
  a.positions.flush();
  a.positions.flush();
  assert.equal(a.saves, 1);
  assert.deepEqual(a.positions.get('doc'), at(2, 0.1, 0.3));
});
test('returning to the top forgets the document', () => {
  const a = store();
  a.positions.remember('doc', at(4, 0.5, 0.6));
  a.positions.remember('doc', at(-1, 0, 0));
  a.positions.flush();
  assert.equal(a.positions.get('doc'), null);
  assert.deepEqual(a.saved, []);
});
test('only the most recent documents are kept', () => {
  const a = store();
  for (let i = 0; i <= POSITION_LIMIT; i++) a.positions.remember('d' + i, at(0, 0.5, 0.5));
  a.positions.flush();
  assert.equal(a.saved.length, POSITION_LIMIT);
  assert.equal(a.positions.get('d0'), null);
  assert.equal(a.saved[0][0], 'd' + POSITION_LIMIT);
});
test('invalid stored or reported positions are ignored', () => {
  const m = readPositions([
    ['ok', at(0, 0.5, 0.5)],
    ['ok', at(9, 0.5, 0.5)],
    ['', at(0, 0.5, 0.5)],
    ['x'.repeat(81), at(0, 0.5, 0.5)],
    ['bad-section', at(1.5, 0.5, 0.5)],
    ['bad-progress', at(0, 2, 0.5)],
    ['bad-ratio', at(0, 0.5, NaN)],
    'junk',
    null,
  ]);
  assert.deepEqual([...m.keys()], ['ok']);
  assert.deepEqual(m.get('ok'), at(0, 0.5, 0.5));
  assert.equal(readPositions({}).size, 0);
  const a = store('not a list');
  a.positions.remember('', at(0, 0.5, 0.5));
  a.positions.remember('doc', { section: 0 });
  a.positions.flush();
  assert.equal(a.saves, 0);
});
test('storage failures never break reading', () => {
  const p = createReadingPositions({
    load: () => {
      throw new Error('blocked');
    },
    save: () => {
      throw new Error('quota');
    },
  });
  p.remember('doc', at(1, 0.5, 0.5));
  p.flush();
  assert.deepEqual(p.get('doc'), at(1, 0.5, 0.5));
});
