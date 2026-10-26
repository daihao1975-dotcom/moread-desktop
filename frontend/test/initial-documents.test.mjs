import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeDocuments } from '../src/initial-documents.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(read) {
  const initial = deferred(),
    handlers = {},
    events = [];
  let version = 0,
    rendered = 0,
    error = '';
  let queue = Promise.resolve();
  const enqueue = fn => {
    queue = queue.then(fn).catch(e => {
      error = e.message;
    });
    return queue;
  };
  initializeDocuments({
    runtime: { EventsOn: (name, fn) => (handlers[name] = fn) },
    ready: () => initial.promise,
    enqueue,
    addResult: async r => {
      events.push(r);
      if (r?.documents?.length) {
        await read(r.documents[0]);
        version++;
      }
    },
    ensureRendered: () => {
      if (version === 0) rendered++;
    },
    onError: e => {
      error = e.message;
    },
  });
  return {
    initial,
    handlers,
    events,
    done: async () => {
      await tick();
      await queue;
    },
    state: () => ({ version, rendered, error }),
  };
}
test('empty and all skipped startup results render welcome', async () => {
  for (const result of [{ documents: [] }, { documents: [], skipped: ['too large'] }]) {
    const h = harness(async () => {});
    h.initial.resolve(result);
    await h.done();
    assert.equal(h.state().rendered, 1);
    assert.equal(h.state().version, 0);
  }
});
test('startup file renders the loaded document', async () => {
  const h = harness(async () => {});
  h.initial.resolve({ documents: [{ id: 'one' }] });
  await h.done();
  assert.deepEqual(h.state(), { version: 1, rendered: 0, error: '' });
});
test('failed startup read still renders welcome and reports error', async () => {
  const h = harness(async () => {
    throw Error('read failed');
  });
  h.initial.resolve({ documents: [{ id: 'one' }] });
  await h.done();
  assert.deepEqual(h.state(), { version: 0, rendered: 1, error: 'read failed' });
});
test('files-opened before FrontendReady is processed in order', async () => {
  const h = harness(async () => {});
  h.handlers['files-opened']({ documents: [{ id: 'early' }] });
  h.initial.resolve({ documents: [] });
  await h.done();
  assert.deepEqual(
    h.events.map(r => r.documents[0]?.id || ''),
    ['early', ''],
  );
  assert.deepEqual(h.state(), { version: 1, rendered: 0, error: '' });
});
