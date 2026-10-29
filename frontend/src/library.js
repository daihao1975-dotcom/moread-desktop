import { createElement, Folder, FolderOpen, FileText, ChevronRight, Ellipsis } from 'lucide';
import { t } from './i18n.js';
import { folderPath, descendants, moveFolder, removeFolder } from './library-model.js';

const node = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};
const glyph = data => createElement(data, { 'aria-hidden': 'true', focusable: 'false' });

// The sidebar owns only presentation and logical membership. Native file I/O
// continues through the application's existing document transition and save flow.
export function createLibrary({
  list,
  changed,
  activate,
  newDocument,
  openFiles,
  removeDocument,
  folderRemoved,
  onError,
}) {
  let state = { folders: [], entries: [] },
    selected = '',
    menu;
  let files = [],
    currentID = '',
    filter = '';
  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };
  document.addEventListener('pointerdown', e => {
    if (menu && !menu.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });
  list.addEventListener('scroll', closeMenu);
  const commit = () => {
    render(files, currentID, filter);
    changed(state);
  };

  function form(title, build) {
    return new Promise(resolve => {
      closeMenu();
      const dialog = node('dialog', 'library-dialog'),
        content = node('form');
      content.method = 'dialog';
      const heading = node('h2', '', title);
      heading.id = 'library-dialog-title';
      dialog.setAttribute('aria-labelledby', heading.id);
      const field = build(content, heading);
      const actions = node('div', 'dialog-actions');
      const cancel = node('button', '', t('dirty.cancel'));
      cancel.type = 'button';
      cancel.onclick = () => dialog.close();
      const save = node('button', 'primary', t('library.confirm'));
      save.type = 'submit';
      actions.append(cancel, save);
      content.append(actions);
      dialog.append(content);
      document.body.append(dialog);
      let value = null;
      content.onsubmit = e => {
        e.preventDefault();
        const v = field.value.trim();
        if (field.tagName === 'INPUT' && (!v || /[\u0000-\u001f\u007f]/.test(v))) {
          field.setCustomValidity(t('library.nameRequired'));
          field.reportValidity();
          return;
        }
        value = v;
        dialog.close();
      };
      dialog.onclose = () => {
        dialog.remove();
        resolve(value);
      };
      dialog.showModal();
      field.focus();
      if (field.tagName === 'INPUT') field.select();
    });
  }

  async function nameDialog(title, initial = '') {
    return form(title, (content, heading) => {
      const hint = node('p', 'library-hint', t('library.hint'));
      const field = node('input');
      field.value = initial;
      field.maxLength = 160;
      field.setAttribute('aria-label', t('library.folderName'));
      field.oninput = () => field.setCustomValidity('');
      content.append(heading, hint, field);
      return field;
    });
  }

  async function addFolder(parent = selected) {
    let depth = 0;
    for (let p = parent; p; ) {
      depth++;
      p = state.folders.find(f => f.id === p)?.parent || '';
    }
    if (depth >= 32 || state.folders.length >= 1000) return onError(new Error(t('err.libraryInvalid')));
    const name = await nameDialog(t('library.newFolder'));
    if (name === null) return;
    const id = crypto.randomUUID();
    state.folders.push({ id, name, parent, collapsed: false });
    if (parent) state.folders.find(f => f.id === parent).collapsed = false;
    selected = id;
    commit();
  }

  async function destination(id, isFolder) {
    const excluded = isFolder ? descendants(state, id) : new Set();
    const target = await form(t('library.move'), (content, heading) => {
      const field = node('select');
      field.setAttribute('aria-label', t('library.destination'));
      const root = node('option', '', t('library.ungrouped'));
      root.value = '';
      field.append(root);
      for (const f of state.folders.filter(f => !excluded.has(f.id))) {
        const option = node('option', '', folderPath(state, f.id));
        option.value = f.id;
        field.append(option);
      }
      field.value = isFolder
        ? state.folders.find(f => f.id === id).parent
        : state.entries.find(e => e.id === id)?.folder || '';
      content.append(heading, node('p', 'library-hint', t('library.hint')), field);
      return field;
    });
    if (target === null) return;
    if (isFolder) {
      if (!moveFolder(state, id, target)) return onError(new Error(t('err.libraryInvalid')));
    } else state.entries.find(e => e.id === id).folder = target;
    if (target) state.folders.find(f => f.id === target).collapsed = false;
    commit();
  }

  function showMenu(anchor, actions) {
    closeMenu();
    menu = node('div', 'library-menu');
    menu.setAttribute('role', 'menu');
    for (const [label, action] of actions) {
      const b = node('button', '', label);
      b.setAttribute('role', 'menuitem');
      b.onclick = () => {
        closeMenu();
        Promise.resolve().then(action).catch(onError);
      };
      menu.append(b);
    }
    document.body.append(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(rect.bottom, window.innerHeight - menu.offsetHeight - 8)) + 'px';
    menu.querySelector('button')?.focus();
    menu.onkeydown = e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = [...menu.querySelectorAll('button')],
          index = buttons.indexOf(document.activeElement);
        buttons[(index + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
      }
      if (e.key === 'Escape') anchor.focus();
    };
  }

  function more(row, actions) {
    const b = node('button', 'library-more');
    b.setAttribute('aria-label', t('library.actions'));
    b.append(glyph(Ellipsis));
    b.onclick = () => showMenu(b, actions);
    row.oncontextmenu = e => {
      e.preventDefault();
      showMenu(b, actions);
    };
    row.append(b);
  }

  function dropTarget(row, folder) {
    row.ondragover = e => {
      if (!e.dataTransfer.types.includes('application/x-moread-library')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drop-target');
    };
    row.ondragleave = () => row.classList.remove('drop-target');
    row.ondrop = e => {
      const data = e.dataTransfer.getData('application/x-moread-library');
      if (!data) return;
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drop-target');
      try {
        const { id, type } = JSON.parse(data);
        if (type === 'folder') {
          if (!moveFolder(state, id, folder)) return;
        } else {
          const entry = state.entries.find(e => e.id === id);
          if (!entry) return;
          entry.folder = folder;
        }
        if (folder) state.folders.find(f => f.id === folder).collapsed = false;
        commit();
      } catch (error) {
        onError(error);
      }
    };
  }

  function draggable(row, id, type) {
    row.draggable = true;
    row.ondragstart = e => {
      e.stopPropagation();
      e.dataTransfer.setData('application/x-moread-library', JSON.stringify({ id, type }));
      e.dataTransfer.effectAllowed = 'move';
    };
  }

  function render(nextFiles, nextCurrent, query = '') {
    files = nextFiles;
    currentID = nextCurrent;
    filter = query;
    closeMenu();
    list.replaceChildren();
    const q = query.trim().toLocaleLowerCase();
    const entries = new Map(state.entries.map(e => [e.id, e.folder]));
    const folderOf = file => (file.draft ? file.folder : entries.get(file.id) || '');
    const matches = new Set();
    for (const f of state.folders) if (f.name.toLocaleLowerCase().includes(q)) matches.add(f.id);
    const matchingFolders = new Set();
    if (q) for (const id of matches) for (const child of descendants(state, id)) matchingFolders.add(child);
    const shown = files.filter(
      f => !q || (f.relative || f.name).toLocaleLowerCase().includes(q) || matchingFolders.has(folderOf(f)),
    );
    const visible = new Set();
    const reveal = id => {
      while (id && !visible.has(id)) {
        visible.add(id);
        id = state.folders.find(f => f.id === id)?.parent;
      }
    };
    for (const id of matches) reveal(id);
    for (const f of shown) reveal(folderOf(f));
    const appendFiles = (parent, folder) => {
      for (const f of shown.filter(f => folderOf(f) === folder)) {
        const row = node('div', 'library-file');
        row.dataset.file = f.id;
        const b = node('button', 'file-row' + (f.id === currentID ? ' active' : ''));
        if (f.id === currentID) b.setAttribute('aria-current', 'page');
        b.append(glyph(FileText), node('span', 'library-name', folder ? f.name : f.relative || f.name));
        b.title = f.relative || f.name;
        b.onclick = () => {
          selected = folder;
          activate(f);
        };
        row.append(b);
        if (!f.draft)
          more(row, [
            [t('library.move'), () => destination(f.id, false)],
            [t('library.removeFile'), () => removeDocument(f.id)],
          ]);
        if (!f.draft) draggable(row, f.id, 'file');
        parent.append(row);
      }
    };
    const appendFolders = (parent, parentID) => {
      for (const f of state.folders.filter(f => f.parent === parentID && (!q || visible.has(f.id)))) {
        const section = node('section', 'library-group'),
          row = node('div', 'library-folder' + (selected === f.id ? ' selected' : ''));
        section.dataset.folder = f.id;
        const b = node('button', 'folder-row');
        const expanded = !!q || !f.collapsed;
        b.setAttribute('aria-expanded', String(expanded));
        const arrow = glyph(ChevronRight);
        arrow.classList.add('folder-chevron');
        b.append(arrow, glyph(expanded ? FolderOpen : Folder), node('span', 'library-name', f.name));
        b.title = folderPath(state, f.id);
        b.onclick = () => {
          selected = f.id;
          f.collapsed = !f.collapsed;
          commit();
        };
        row.append(b);
        more(row, [
          [
            t('library.newFile'),
            () => {
              selected = f.id;
              newDocument(f.id);
            },
          ],
          [t('library.newFolder'), () => addFolder(f.id)],
          [
            t('library.addFiles'),
            () => {
              selected = f.id;
              openFiles(f.id);
            },
          ],
          [
            t('library.rename'),
            async () => {
              const name = await nameDialog(t('library.rename'), f.name);
              if (name !== null) {
                f.name = name;
                commit();
              }
            },
          ],
          [t('library.move'), () => destination(f.id, true)],
          [
            t('library.removeFolder'),
            () => {
              removeFolder(state, f.id);
              for (const doc of files) if (doc.draft && doc.folder === f.id) doc.folder = f.parent;
              folderRemoved?.(f.id, f.parent);
              if (selected === f.id) selected = f.parent;
              commit();
            },
          ],
        ]);
        dropTarget(row, f.id);
        draggable(row, f.id, 'folder');
        section.append(row);
        if (expanded) {
          const children = node('div', 'library-children');
          appendFolders(children, f.id);
          appendFiles(children, f.id);
          if (!children.childElementCount)
            children.append(node('p', 'library-empty', t('library.emptyFolder')));
          section.append(children);
        }
        parent.append(section);
      }
    };
    const root = node('button', 'library-root' + (!selected ? ' selected' : ''), t('library.ungrouped'));
    root.onclick = () => {
      selected = '';
      render(files, currentID, filter);
    };
    dropTarget(root, '');
    list.append(root);
    appendFiles(list, '');
    appendFolders(list, '');
    if (q && !shown.length && !visible.size) list.append(node('p', 'empty-side', t('side.noMatch')));
    return !files.length && !state.folders.length && !q;
  }

  return {
    render,
    addFolder,
    closeMenu,
    state: () => state,
    selected: () => selected,
    restore: value => {
      state = { folders: value.folders || [], entries: value.entries || [] };
    },
    reveal: folder => {
      selected = state.folders.some(f => f.id === folder) ? folder : '';
      for (let id = selected; id; ) {
        const f = state.folders.find(f => f.id === id);
        f.collapsed = false;
        id = f.parent;
      }
    },
  };
}
