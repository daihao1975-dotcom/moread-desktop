export function folderPath(state, id) {
  const names = [];
  for (let f = state.folders.find(f => f.id === id); f; f = state.folders.find(p => p.id === f.parent))
    names.unshift(f.name);
  return names.join(' / ');
}

export function descendants(state, id) {
  const ids = new Set([id]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of state.folders)
      if (ids.has(f.parent) && !ids.has(f.id)) {
        ids.add(f.id);
        changed = true;
      }
  }
  return ids;
}

export function moveFolder(state, id, parent) {
  if (descendants(state, id).has(parent)) return false;
  const folder = state.folders.find(f => f.id === id);
  if (!folder || (parent && !state.folders.some(f => f.id === parent))) return false;
  // Keep the native library's maximum depth, including the moved subtree.
  let parentDepth = 0;
  for (let p = parent; p; ) {
    parentDepth++;
    p = state.folders.find(f => f.id === p)?.parent || '';
  }
  let subtreeDepth = 1;
  for (const child of descendants(state, id)) {
    let d = 1;
    for (let p = child; p !== id; ) {
      p = state.folders.find(f => f.id === p)?.parent;
      d++;
    }
    subtreeDepth = Math.max(subtreeDepth, d);
  }
  if (parentDepth + subtreeDepth > 32) return false;
  folder.parent = parent;
  return true;
}

// Removing a logical folder promotes its contents, never removes documents.
export function removeFolder(state, id) {
  const folder = state.folders.find(f => f.id === id);
  if (!folder) return;
  for (const f of state.folders) if (f.parent === id) f.parent = folder.parent;
  for (const e of state.entries) if (e.folder === id) e.folder = folder.parent;
  state.folders = state.folders.filter(f => f.id !== id);
}

export function assignDocuments(state, documents, folder = '', replace = false) {
  if (!state.folders.some(f => f.id === folder)) folder = '';
  for (const doc of documents) {
    const entry = state.entries.find(e => e.id === doc.id);
    if (entry) {
      if (replace) entry.folder = folder;
    } else state.entries.push({ id: doc.id, folder });
  }
}

// Saving a draft or Save As keeps its logical destination; the original file
// remains in its group when Save As creates a second disk file.
export function savedDocument(state, before, after, folder = '') {
  const old = state.entries.find(e => e.id === before);
  assignDocuments(state, [{ id: after }], old?.folder ?? folder);
}
