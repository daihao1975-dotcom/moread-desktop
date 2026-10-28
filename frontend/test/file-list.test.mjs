import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFolderUpdate, mergeFiles } from '../src/file-list.js';

const doc = (id, relative) => ({ id, name: relative.split('/').pop(), relative });

test('merging replaces by id and keeps path order', () => {
  const files = [doc('b', 'b.md'), doc('a', 'a.md')];
  const out = mergeFiles(files, [doc('c', 'sub/c.md'), { ...doc('a', 'a.md'), hash: 'new' }], 'en');
  assert.deepEqual(
    out.map(f => f.id),
    ['a', 'b', 'c'],
  );
  assert.equal(out[0].hash, 'new');
});

test('folder update adds and removes but keeps the open document', () => {
  const files = [doc('a', 'a.md'), doc('b', 'b.md'), doc('open', 'open.md')];
  const out = applyFolderUpdate(files, { added: [doc('c', 'c.md')], removed: ['a', 'open'] }, 'open', 'en');
  assert.deepEqual(
    out.map(f => f.id),
    ['b', 'c', 'open'],
  );
});

test('an empty update returns the same list so the sidebar is not redrawn', () => {
  const files = [doc('a', 'a.md')];
  assert.equal(applyFolderUpdate(files, { added: [], removed: [] }, '', 'en'), files);
  assert.equal(applyFolderUpdate(files, { added: [], removed: ['gone'] }, '', 'en'), files);
});
