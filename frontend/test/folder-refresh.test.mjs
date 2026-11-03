import assert from 'node:assert/strict';
import test from 'node:test';
import { createFolderRefresher } from '../src/folder-refresh.js';
import { assignDocuments, savedDocument } from '../src/library-model.js';

const doc = id => ({ id, name: `${id}.md` });
function fixture() {
  let resolve, reject;
  const pending = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const state = {
    files: [doc('old')],
    openId: 'old',
    lang: 'en',
    closed: false,
    calls: 0,
    writes: 0,
    library: {
      folders: [{ id: 'chosen', parent: '', name: 'Chosen' }],
      entries: [{ id: 'old', folder: '' }],
    },
  };
  const refresh = createFolderRefresher({
    canRefresh: () => !state.closed,
    request: () => {
      state.calls++;
      return pending;
    },
    isClosed: () => state.closed,
    snapshot: () => state,
    apply: files => {
      state.files = files;
      assignDocuments(state.library, files);
      state.library.entries = state.library.entries.filter(e => files.some(f => f.id === e.id));
      state.writes++;
    },
  });
  return { state, refresh, resolve, reject };
}

for (const action of ['open', 'save as']) {
  test(`delayed folder refresh preserves documents added by ${action} and their classification`, async () => {
    const { state, refresh, resolve } = fixture();
    const run = refresh();
    state.files = [...state.files, doc('new')];
    if (action === 'open') assignDocuments(state.library, [doc('new')], 'chosen');
    else savedDocument(state.library, 'draft', 'new', 'chosen');
    state.openId = 'new';
    resolve({ added: [doc('folder')], removed: ['old'] });
    await run;
    assert.deepEqual(
      state.files.map(d => d.id),
      ['folder', 'new'],
    );
    assert.deepEqual(
      state.library.entries.find(e => e.id === 'new'),
      { id: 'new', folder: 'chosen' },
    );
    assert.equal(
      state.library.entries.some(e => e.id === 'old'),
      false,
    );
    assert.equal(state.writes, 1);
  });
}

test('delayed refresh protects the document current when the result arrives', async () => {
  const { state, refresh, resolve } = fixture();
  state.files.push(doc('next'));
  const run = refresh();
  state.openId = 'next';
  resolve({ removed: ['old', 'next'] });
  await run;
  assert.deepEqual(
    state.files.map(d => d.id),
    ['next'],
  );
});

test('close approval while refreshing prevents list changes and persistence', async () => {
  const { state, refresh, resolve } = fixture();
  const original = state.files;
  const run = refresh();
  state.closed = true;
  resolve({ added: [doc('late')], removed: ['old'] });
  await run;
  assert.equal(state.files, original);
  assert.equal(state.writes, 0);
  await refresh();
  assert.equal(state.calls, 1);
});

test('concurrent refreshes share a single request and failure preserves existing files', async () => {
  const { state, refresh, reject } = fixture();
  const original = state.files;
  const run = refresh();
  await refresh();
  assert.equal(state.calls, 1);
  reject(new Error('unreadable'));
  await run;
  assert.equal(state.files, original);
  assert.equal(state.writes, 0);
  await refresh();
  assert.equal(state.calls, 2); // failure releases the single-flight guard
});
