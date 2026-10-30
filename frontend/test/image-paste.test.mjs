import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { bindImagePaste, clipboardImages, imageEdit } from '../src/image-paste.js';

function harness({ ensureSaved = async () => true, store = async () => ['assets/a.png'] } = {}) {
  const dom = new JSDOM('<textarea>before SELECT after</textarea>'),
    editor = dom.window.document.querySelector('textarea'),
    errors = [],
    calls = [],
    busy = [];
  let queue = Promise.resolve(),
    key = 1;
  editor.setSelectionRange(7, 13);
  bindImagePaste(editor, {
    enqueue: fn => (queue = queue.then(fn)),
    documentKey: () => key,
    ensureSaved,
    store: encoded => {
      calls.push(encoded);
      return store(encoded);
    },
    apply: edit => {
      editor.setRangeText(edit.text, edit.start, edit.end);
      editor.setSelectionRange(...edit.select);
      editor.dispatchEvent(new dom.window.Event('input'));
    },
    busy: value => busy.push(value),
    onError: e => errors.push(e.message),
  });
  const image = (type = 'image/png') => new dom.window.File(['screenshot'], 'image.png', { type });
  return {
    editor,
    errors,
    calls,
    busy,
    image,
    switch: () => key++,
    done: () => queue,
    paste: (files = [image()]) => {
      const event = new dom.window.Event('paste', { cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { files } });
      editor.dispatchEvent(event);
      return event;
    },
  };
}

test('clipboard images use items first without duplicating files; text is untouched', async () => {
  const file = { type: 'image/png' };
  assert.deepEqual(
    clipboardImages({ items: [{ kind: 'file', type: file.type, getAsFile: () => file }], files: [file] }),
    [file],
  );
  assert.deepEqual(
    clipboardImages({ items: [{ kind: 'file', type: file.type, getAsFile: () => null }], files: [file] }),
    [file],
  );
  const h = harness();
  assert.equal(h.paste([]).defaultPrevented, false);
  await h.done();
  assert.equal(h.editor.value, 'before SELECT after');
  assert.equal(h.calls.length, 0);
});

test('paste replaces the selection once, stores bytes, positions the caret and emits input', async () => {
  const h = harness();
  let inputs = 0;
  h.editor.addEventListener('input', () => inputs++);
  assert.equal(h.paste().defaultPrevented, true);
  assert.equal(h.editor.readOnly, true);
  await h.done();
  assert.equal(h.editor.value, 'before \n\n![Image](assets/a.png)\n\n after');
  assert.equal(h.calls[0][0], Buffer.from('screenshot').toString('base64'));
  assert.equal(inputs, 1);
  assert.equal(h.editor.selectionStart, h.editor.value.indexOf(' after'));
  assert.equal(h.editor.readOnly, false);
  assert.deepEqual(h.busy, [true, false]);
});

test('save cancellation and image write failure leave the document and selection intact', async () => {
  for (const options of [
    { ensureSaved: async () => false },
    {
      store: async () => {
        throw Error('disk full');
      },
    },
  ]) {
    const h = harness(options);
    h.paste();
    await h.done();
    assert.equal(h.editor.value, 'before SELECT after');
    assert.equal(h.editor.selectionStart, 7);
    assert.equal(h.editor.selectionEnd, 13);
    assert.equal(h.editor.readOnly, false);
  }
});

test('a document transition before processing cannot paste into a different document', async () => {
  const h = harness();
  h.paste();
  h.switch();
  await h.done();
  assert.equal(h.calls.length, 0);
  assert.equal(h.editor.value, 'before SELECT after');
  assert.equal(h.editor.readOnly, false);
});

test('unsupported and oversized images fail before save or file I/O', async () => {
  const h = harness();
  h.paste([h.image('image/svg+xml')]);
  h.paste([{ type: 'image/png', size: 21 * 1024 * 1024 }]);
  await h.done();
  assert.equal(h.errors.length, 2);
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.busy, []);
});

test('images are separate Markdown blocks with a trailing insertion line', () => {
  const edit = imageEdit('', 0, 0, ['assets/a.png', 'assets/b.jpg']);
  assert.equal(edit.text, '![Image](assets/a.png)\n\n![Image](assets/b.jpg)\n');
  assert.deepEqual(edit.select, [edit.text.length, edit.text.length]);
});
