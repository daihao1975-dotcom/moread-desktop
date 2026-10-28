import test from 'node:test';
import assert from 'node:assert/strict';
import { externalChanges } from '../src/external-changes.js';

function setup({ disk = 'h1', edited = false, busy = false } = {}) {
  const state = { doc: { id: 'a', hash: 'h1' }, disk, edited, busy, reloads: [], warnings: [] };
  const watcher = externalChanges({
    open: () => state.doc,
    busy: () => state.busy,
    dirty: () => state.edited,
    readHash: async () => {
      if (state.disk === null) throw new Error('gone');
      return state.disk;
    },
    reload: (id, hash) => state.reloads.push([id, hash]),
    warn: kind => state.warnings.push(kind),
  });
  return { state, watcher };
}

test('unchanged file does nothing', async () => {
  const { state, watcher } = setup();
  await watcher.check();
  assert.deepEqual([state.reloads, state.warnings], [[], []]);
});

test('clean document reloads; edited document warns once per version', async () => {
  const clean = setup({ disk: 'h2' });
  await clean.watcher.check();
  assert.deepEqual(clean.state.reloads, [['a', 'h1']]);

  const { state, watcher } = setup({ disk: 'h2', edited: true });
  await watcher.check();
  await watcher.check();
  assert.deepEqual(state.warnings, ['changed']);
  state.disk = 'h3';
  await watcher.check();
  assert.deepEqual(state.warnings, ['changed', 'changed']);
  assert.deepEqual(state.reloads, []);
});

test('reset after saving warns again for the same external version', async () => {
  const { state, watcher } = setup({ disk: 'h2', edited: true });
  await watcher.check();
  watcher.reset();
  await watcher.check();
  assert.deepEqual(state.warnings, ['changed', 'changed']);
});

test('missing file is reported once; busy or untitled documents are skipped', async () => {
  const { state, watcher } = setup({ disk: null });
  await watcher.check();
  await watcher.check();
  assert.deepEqual(state.warnings, ['missing']);

  const busy = setup({ disk: 'h2', busy: true });
  await busy.watcher.check();
  busy.state.doc = { id: '', hash: '' };
  busy.state.busy = false;
  await busy.watcher.check();
  assert.deepEqual([busy.state.reloads, busy.state.warnings], [[], []]);
});

test('a document switch during the hash read cancels the check', async () => {
  const { state, watcher } = setup({ disk: 'h2' });
  const pending = watcher.check();
  state.doc = { id: 'b', hash: 'x' };
  await pending;
  assert.deepEqual(state.reloads, []);
});
