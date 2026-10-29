import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createCloseRequest } from '../src/close-request.js';
import { createLibraryWriter } from '../src/library-writer.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const state = () => ({
  folders: [{ id: 'work', name: '工作', parent: '', collapsed: false }],
  entries: [{ id: 'doc', folder: 'work' }],
});

function setup(t, options = {}) {
  const { window } = new JSDOM('<textarea>unsaved text</textarea>');
  t.after(() => window.close());
  const editor = window.document.querySelector('textarea'),
    events = [],
    errors = [],
    library = state();
  let disk = null;
  const writer = createLibraryWriter({
    write: options.write || (async value => (disk = value)),
    onError: error => errors.push(error.message),
  });
  const request = createCloseRequest({
    enqueue: fn => Promise.resolve().then(fn),
    guard: options.guard || (async () => true),
    flush: async () => {
      writer.persist(library);
      await writer.flush();
    },
    setLocked: value => {
      window.document.body.inert = value;
      editor.disabled = value;
      events.push(value ? 'locked' : 'unlocked');
    },
    quit: options.quit || (async () => events.push('quit')),
    cancel: options.cancel || (async () => events.push('cancel')),
    onError: error => errors.push(error.message),
  });
  // Browser input cannot change a disabled textarea. Exercise the same gate during a slow flush.
  const type = value => {
    if (!editor.disabled && !window.document.body.inert) editor.value = value;
  };
  return { request, writer, editor, window, events, errors, library, type, disk: () => disk };
}

test('slow library writes lock input before waiting and quit only after the final snapshot', async t => {
  const pending = deferred(),
    writes = [];
  const h = setup(t, {
    write: async value => {
      writes.push(value);
      if (writes.length === 1) await pending.promise;
    },
  });
  h.writer.persist(h.library);
  const closing = h.request();
  await tick();
  assert.equal(h.editor.disabled, true);
  assert.equal(h.window.document.body.inert, true);
  h.type('typed during slow disk write');
  assert.equal(h.editor.value, 'unsaved text');
  assert.deepEqual(h.events, ['locked']);
  assert.equal(h.request(), undefined, 'duplicate requests do not quit twice');
  pending.resolve();
  assert.equal(await closing, true);
  assert.deepEqual(h.events, ['locked', 'quit']);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes.at(-1), h.library);
  assert.equal(h.request(), undefined, 'successful quit remains locked');
});

test('failed final write cancels quit, preserves content, and allows a successful retry', async t => {
  let failing = true;
  const h = setup(t, {
    write: async () => {
      if (failing) throw Error('disk full');
    },
  });
  assert.equal(await h.request(), false);
  assert.deepEqual(h.events, ['locked', 'cancel', 'unlocked']);
  assert.equal(h.editor.disabled, false);
  assert.equal(h.window.document.body.inert, false);
  assert.ok(h.errors.includes('disk full'));
  assert.equal(h.editor.value, 'unsaved text');
  h.type('still editable');
  failing = false;
  assert.equal(await h.request(), true);
  assert.equal(h.editor.value, 'still editable');
  assert.deepEqual(h.events.slice(-2), ['locked', 'quit']);
});

test('after a write failure the user can cancel a later quit without another write', async t => {
  let allow = true,
    writes = 0;
  const h = setup(t, {
    guard: async () => allow,
    write: async () => {
      writes++;
      throw Error('permission denied');
    },
  });
  await h.request();
  allow = false;
  assert.equal(await h.request(), false);
  assert.equal(writes, 1);
  assert.equal(h.editor.disabled, false);
  assert.equal(h.events.at(-1), 'cancel');
  assert.equal(h.editor.value, 'unsaved text');
});

test('clean, save and discard decisions all flush before a normal quit', async t => {
  for (const decision of ['clean', 'save', 'discard']) {
    let saved = false;
    const h = setup(t, {
      guard: async () => {
        if (decision === 'save') saved = true;
        return true;
      },
    });
    assert.equal(await h.request(), true);
    assert.equal(saved, decision === 'save');
    assert.deepEqual(h.disk(), h.library);
    assert.deepEqual(h.events, ['locked', 'quit']);
  }
});

test('cancel or failed document save does not lock, flush or quit', async t => {
  for (const decision of ['cancel', 'save failed']) {
    const h = setup(t, { guard: async () => false });
    assert.equal(await h.request(), false, decision);
    assert.equal(h.disk(), null);
    assert.deepEqual(h.events, ['cancel']);
    assert.equal(h.editor.disabled, false);
    assert.equal(h.editor.value, 'unsaved text');
  }
});

test('native Quit and CancelClose errors still restore editing and permit retry', async t => {
  let fail = true;
  const h = setup(t, {
    quit: async () => {
      if (fail) throw Error('quit failed');
    },
    cancel: async () => {
      throw Error('cancel failed');
    },
  });
  assert.equal(await h.request(), false);
  assert.equal(h.editor.disabled, false);
  assert.equal(h.window.document.body.inert, false);
  assert.deepEqual(h.errors, ['cancel failed', 'quit failed']);
  fail = false;
  assert.equal(await h.request(), true);
});

test('writer serializes immutable snapshots and flush includes writes queued while waiting', async () => {
  const slow = deferred(),
    writes = [],
    library = state();
  const writer = createLibraryWriter({
    write: async value => {
      writes.push(value);
      if (writes.length === 1) await slow.promise;
    },
    onError: assert.fail,
  });
  writer.persist(library);
  let finished = false;
  const flushing = writer.flush().then(() => (finished = true));
  await tick();
  library.folders[0].name = 'renamed';
  writer.persist(library);
  library.entries[0].folder = '';
  writer.persist(library);
  assert.equal(writes.length, 1);
  assert.equal(finished, false);
  slow.resolve();
  await flushing;
  assert.equal(writes.length, 3);
  assert.equal(writes[0].folders[0].name, '工作');
  assert.equal(writes[1].entries[0].folder, 'work');
  assert.deepEqual(writes[2], library);
});

test('background write failure remains observable and latest state recovers on the next write', async () => {
  const reported = [],
    library = state();
  let fail = true,
    disk;
  const writer = createLibraryWriter({
    write: async value => {
      if (fail) throw Error('disk full');
      disk = value;
    },
    onError: error => reported.push(error.message),
  });
  // Ignore the returned promise, as sidebar changes do; reporting handles rejection.
  writer.persist(library);
  await tick();
  await assert.rejects(writer.flush(), /disk full/);
  assert.deepEqual(reported, ['disk full']);
  library.folders[0].name = 'recovered';
  fail = false;
  await writer.persist(library);
  await writer.flush();
  const restored = JSON.parse(JSON.stringify(disk));
  assert.deepEqual(restored, library, 'restart receives both folders and document membership');
});
