import { applyFolderUpdate } from './file-list.js';

// A refresh may overlap opening/saving/switching a document. Read live state only
// after the native result arrives, and never persist after closing is approved.
export function createFolderRefresher({ canRefresh, request, isClosed, snapshot, apply }) {
  let refreshing = false;
  return async () => {
    if (refreshing || !canRefresh()) return;
    refreshing = true;
    try {
      const result = await request();
      if (isClosed()) return;
      const { files, openId, lang } = snapshot();
      const next = applyFolderUpdate(files, result, openId, lang);
      if (next !== files) apply(next);
    } catch {
      // A folder that cannot be listed keeps its last known files.
    } finally {
      refreshing = false;
    }
  };
}
