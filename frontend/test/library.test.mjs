import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  assignDocuments,
  savedDocument,
  moveFolder,
  removeFolder,
  folderPath,
} from '../src/library-model.js';
import { createLibrary } from '../src/library.js';
import { setLanguage, t } from '../src/i18n.js';

const sample = () => ({
  folders: [
    { id: 'work', name: '工作', parent: '', collapsed: false },
    { id: 'project', name: '项目', parent: 'work', collapsed: true },
    { id: 'personal', name: '生活', parent: '', collapsed: false },
  ],
  entries: [
    { id: 'a', folder: 'project' },
    { id: 'b', folder: '' },
  ],
});

test('opening existing documents preserves grouping, while explicit add reassigns without duplication', () => {
  const state = sample();
  assignDocuments(state, [{ id: 'a' }, { id: 'c' }], 'personal');
  assert.equal(state.entries.find(e => e.id === 'a').folder, 'project');
  assert.equal(state.entries.find(e => e.id === 'c').folder, 'personal');
  assignDocuments(state, [{ id: 'a' }], 'personal', true);
  assert.equal(state.entries.find(e => e.id === 'a').folder, 'personal');
  assert.equal(state.entries.length, 3);
});
test('draft save and Save As retain destination and preserve the original reference', () => {
  const state = sample();
  savedDocument(state, '', 'draft-saved', 'project');
  savedDocument(state, 'a', 'copy', 'personal');
  assert.equal(state.entries.find(e => e.id === 'draft-saved').folder, 'project');
  assert.equal(state.entries.find(e => e.id === 'copy').folder, 'project');
  assert.equal(state.entries.find(e => e.id === 'a').folder, 'project');
  savedDocument(state, 'a', 'a');
  assert.equal(state.entries.filter(e => e.id === 'a').length, 1);
});
test('folder moves reject cycles and folder removal promotes documents and subfolders', () => {
  const state = sample();
  assert.equal(moveFolder(state, 'work', 'project'), false);
  assert.equal(moveFolder(state, 'work', 'work'), false);
  assert.equal(moveFolder(state, 'project', 'missing'), false);
  assert.equal(moveFolder(state, 'work', 'personal'), true);
  assert.equal(folderPath(state, 'project'), '生活 / 工作 / 项目');
  removeFolder(state, 'work');
  assert.equal(state.folders.find(f => f.id === 'project').parent, 'personal');
  removeFolder(state, 'project');
  assert.equal(state.entries.find(e => e.id === 'a').folder, 'personal');
  assert.equal(state.entries.length, 2);
});

function harness() {
  const dom = new JSDOM('<nav></nav>', { url: 'https://moread.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  // jsdom does not implement native dialog methods.
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new dom.window.Event('close'));
  };
  setLanguage('zh-CN');
  const calls = [],
    list = document.querySelector('nav');
  const library = createLibrary({
    list,
    changed: state => calls.push(['changed', JSON.parse(JSON.stringify(state))]),
    activate: file => calls.push(['activate', file.id]),
    newDocument: folder => calls.push(['new', folder]),
    openFiles: folder => calls.push(['open', folder]),
    removeDocument: id => calls.push(['remove', id]),
    onError: error => {
      throw error;
    },
  });
  library.restore(sample());
  const files = [
    { id: 'a', name: '说明.md', relative: '原位置/说明.md' },
    { id: 'b', name: '随记.md' },
  ];
  const render = query => library.render(files, 'a', query);
  const menu = async (selector, key) => {
    document.querySelector(selector + ' > .library-more').click();
    [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent === t(key)).click();
    await Promise.resolve();
  };
  return { dom, library, list, calls, files, render, menu };
}
test('filter reveals matches inside collapsed ancestors and uses text nodes for folder names', () => {
  const h = harness();
  h.library.state().folders[0].name = '<img src=x onerror=alert(1)>';
  h.render();
  assert.equal(h.list.querySelector('[data-file="a"]'), null);
  h.render('说明');
  assert.ok(h.list.querySelector('[data-folder="work"] [data-file="a"]'));
  assert.equal(h.list.querySelector('img'), null);
  assert.ok(h.list.textContent.includes('<img src=x onerror=alert(1)>'));
  h.list.querySelector('[data-file="a"] .file-row').click();
  assert.deepEqual(h.calls.at(-1), ['activate', 'a']);
  h.render('项目');
  assert.ok(h.list.querySelector('[data-file="a"]'));
  h.render('不存在');
  assert.ok(h.list.textContent.includes(t('side.noMatch')));
  h.dom.window.close();
});
test('folder actions pass the exact destination to new/open and removal keeps children', async () => {
  const h = harness();
  h.render();
  await h.menu('[data-folder="work"] > .library-folder', 'library.newFile');
  assert.deepEqual(h.calls.at(-1), ['new', 'work']);
  await h.menu('[data-folder="work"] > .library-folder', 'library.addFiles');
  assert.deepEqual(h.calls.at(-1), ['open', 'work']);
  await h.menu('[data-folder="work"] > .library-folder', 'library.removeFolder');
  assert.equal(h.library.state().folders.find(f => f.id === 'project').parent, '');
  assert.equal(h.library.state().entries.length, 2);
  h.dom.window.close();
});
test('new subfolder, rename, move and cancel use dialogs and retain membership', async () => {
  const h = harness();
  h.render();
  const pending = h.library.addFolder('work');
  document.querySelector('dialog input').value = '新项目';
  document.querySelector('dialog form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await pending;
  const folder = h.library.state().folders.at(-1);
  assert.equal(folder.parent, 'work');
  await h.menu(`[data-folder="${folder.id}"] > .library-folder`, 'library.rename');
  document.querySelector('dialog input').value = '重命名';
  document.querySelector('dialog form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(folder.name, '重命名');
  await h.menu(`[data-folder="${folder.id}"] > .library-folder`, 'library.move');
  assert.equal(document.querySelector(`dialog option[value="${folder.id}"]`), null);
  document.querySelector('dialog select').value = 'personal';
  document.querySelector('dialog form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(folder.parent, 'personal');
  const cancelled = h.library.addFolder('');
  document.querySelector('dialog').close();
  await cancelled;
  assert.equal(h.library.state().folders.length, 4);
  h.dom.window.close();
});
test('draft is visible in its logical folder without becoming a persisted entry', () => {
  const h = harness();
  h.library.reveal('project');
  h.library.render([...h.files, { id: 'draft', draft: true, folder: 'project', name: '未命名.md' }], 'draft');
  assert.ok(h.list.querySelector('[data-folder="project"] [data-file="draft"] .active'));
  assert.equal(
    h.library.state().entries.some(e => e.id === 'draft'),
    false,
  );
  h.dom.window.close();
});

test('dragging changes logical membership and rejects moving an ancestor into its child', () => {
  const h = harness();
  h.render('说明');
  const data = new Map();
  const transfer = {
    types: ['application/x-moread-library'],
    setData: (type, value) => data.set(type, value),
    getData: type => data.get(type),
  };
  const event = { dataTransfer: transfer, preventDefault() {}, stopPropagation() {} };
  h.list.querySelector('[data-file="a"]').ondragstart(event);
  h.list.querySelector('.library-root').ondrop(event);
  assert.equal(h.library.state().entries.find(e => e.id === 'a').folder, '');
  h.render('');
  h.list.querySelector('[data-folder="work"] > .library-folder').ondragstart(event);
  h.list.querySelector('[data-folder="project"] > .library-folder').ondrop(event);
  assert.equal(h.library.state().folders.find(f => f.id === 'work').parent, '');
  h.dom.window.close();
});
