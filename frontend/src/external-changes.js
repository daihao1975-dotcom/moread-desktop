// Another program may change the open file. A clean document reloads in place; an edited one keeps its text and
// is warned once per external version. A file that disappears is reported once.
export function externalChanges({ open, busy, dirty, readHash, reload, warn }) {
  let notice = '';
  async function check() {
    const { id, hash } = open();
    if (!id || busy()) return;
    let now;
    try {
      now = await readHash(id);
    } catch {
      if (open().id === id && notice !== id + ':missing') {
        notice = id + ':missing';
        warn('missing');
      }
      return;
    }
    const after = open();
    if (after.id !== id || after.hash !== hash || now === hash) return;
    if (!dirty()) {
      reload(id, hash);
      return;
    }
    if (notice !== id + ':' + now) {
      notice = id + ':' + now;
      warn('changed');
    }
  }
  // A save makes the editor the newest version, so the next external change warns again.
  return { check, reset: () => (notice = '') };
}
