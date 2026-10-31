// Per-document reading positions, keyed by the document id (a hash of its path), most recent first.
// A position is a heading section plus progress within it, so it survives edits above or below.
export const POSITION_LIMIT = 200;
const valid = (id, at) =>
  typeof id === 'string' &&
  id.length > 0 &&
  id.length <= 80 &&
  Number.isInteger(at?.section) &&
  at.section >= -1 &&
  at.section <= 200000 &&
  Number.isFinite(at.progress) &&
  at.progress >= 0 &&
  at.progress <= 1 &&
  Number.isFinite(at.ratio) &&
  at.ratio >= 0 &&
  at.ratio <= 1;
export function readPositions(raw) {
  const out = new Map();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (out.size >= POSITION_LIMIT || !Array.isArray(item)) continue;
    const [id, at] = item;
    if (valid(id, at) && !out.has(id))
      out.set(id, { section: at.section, progress: at.progress, ratio: at.ratio });
  }
  return out;
}
// The top of a document is the default, so it is forgotten rather than stored.
export function createReadingPositions({ load, save, delay = 600 }) {
  let positions = new Map(),
    timer = null;
  try {
    positions = readPositions(load());
  } catch {}
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    try {
      save([...positions]);
    } catch {}
  };
  return {
    get: id => positions.get(id) || null,
    remember(id, at) {
      if (!valid(id, at)) return;
      positions.delete(id);
      if (at.ratio < 0.02) {
        if (timer === null) timer = setTimeout(flush, delay);
        return;
      }
      positions = new Map([
        [id, { section: at.section, progress: at.progress, ratio: at.ratio }],
        ...positions,
      ]);
      while (positions.size > POSITION_LIMIT) positions.delete([...positions.keys()].pop());
      if (timer === null) timer = setTimeout(flush, delay);
    },
    flush: () => {
      if (timer !== null) flush();
    },
  };
}
