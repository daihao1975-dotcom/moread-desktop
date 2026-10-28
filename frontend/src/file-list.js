// Sidebar file list bookkeeping shared by opening, saving and the folder refresh.

export const byPath = lang => (a, b) => (a.relative || a.name).localeCompare(b.relative || b.name, lang);

// mergeFiles adds or replaces documents by id and keeps the list sorted.
export function mergeFiles(files, docs, lang) {
  const seen = new Map(files.map(d => [d.id, d]));
  for (const d of docs) seen.set(d.id, d);
  return [...seen.values()].sort(byPath(lang));
}

// applyFolderUpdate folds a RefreshFolders result into the list. The open document stays even when its
// file is gone, so unsaved text is never pulled out from under the reader; the missing-file warning covers it.
export function applyFolderUpdate(files, { added = [], removed = [] }, openId, lang) {
  const gone = new Set(removed.filter(id => id !== openId));
  const kept = files.filter(f => !gone.has(f.id));
  if (kept.length === files.length && !added.length) return files;
  return mergeFiles(kept, added, lang);
}
