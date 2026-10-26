import test from 'node:test';
import assert from 'node:assert/strict';
import { documentTransition } from '../src/document-transition.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

test('delayed read locks input until the new document is applied', async () => {
  const pending = deferred(),
    editor = { disabled: false, value: 'edited' },
    events = [];
  const switching = documentTransition({
    guard: async () => true,
    load: () => pending.promise,
    apply: d => {
      editor.value = d.content;
      events.push('applied');
    },
    setOpening: v => {
      editor.disabled = v;
      events.push(v ? 'locked' : 'unlocked');
    },
  });
  await tick();
  assert.equal(editor.disabled, true);
  if (!editor.disabled) editor.value = 'later input';
  assert.equal(editor.value, 'edited');
  pending.resolve({ content: 'next' });
  assert.equal(await switching, true);
  assert.equal(editor.value, 'next');
  assert.equal(editor.disabled, false);
  assert.deepEqual(events, ['locked', 'applied', 'unlocked']);
});

test('cancel and failed save leave the editor unchanged and do not read', async () => {
  for (const answer of ['cancel', 'save failed']) {
    let read = 0,
      opening = 0,
      content = 'edited';
    assert.equal(
      await documentTransition({
        guard: async () => false,
        load: async () => {
          read++;
        },
        apply: d => {
          content = d.content;
        },
        setOpening: () => {
          opening++;
        },
      }),
      false,
    );
    assert.equal(content, 'edited', answer);
    assert.equal(read, 0);
    assert.equal(opening, 0);
  }
});

test('read failure restores editing and preserves the current content', async () => {
  let locked = false,
    content = 'edited';
  await assert.rejects(
    documentTransition({
      guard: async () => true,
      load: async () => {
        throw Error('read failed');
      },
      apply: d => {
        content = d.content;
      },
      setOpening: v => {
        locked = v;
      },
    }),
    /read failed/,
  );
  assert.equal(locked, false);
  assert.equal(content, 'edited');
});

test('successful save before read uses the saved baseline and restores editing', async () => {
  let baseline = 'old',
    content = 'edited',
    locked = false;
  const applied = await documentTransition({
    guard: async () => {
      baseline = content;
      return true;
    },
    load: async () => ({ content: 'next' }),
    apply: d => {
      content = d.content;
    },
    setOpening: v => {
      locked = v;
    },
  });
  assert.equal(applied, true);
  assert.equal(baseline, 'edited');
  assert.equal(content, 'next');
  assert.equal(locked, false);
});

test('stale relative action does not apply a document', async () => {
  const pending = deferred();
  let valid = true,
    applied = false,
    locked = false;
  const switching = documentTransition({
    guard: async () => true,
    load: () => pending.promise,
    apply: () => {
      applied = true;
    },
    valid: () => valid,
    setOpening: v => {
      locked = v;
    },
  });
  await tick();
  valid = false;
  pending.resolve({ content: 'stale' });
  assert.equal(await switching, false);
  assert.equal(applied, false);
  assert.equal(locked, false);
});
