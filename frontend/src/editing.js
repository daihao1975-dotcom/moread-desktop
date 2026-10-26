// Markdown editing helpers for the source textarea. Each returns the range to replace, its new text and the selection afterwards.
const LIST = /^(\s*)([-*+]|(\d{1,9})([.)]))(\s+)(\[[ xX]\]\s+)?/;
const QUOTE = /^(\s*(?:>\s?)+)/;
const lineStart = (v, p) => v.lastIndexOf('\n', p - 1) + 1;
const lineEnd = (v, p) => {
  const i = v.indexOf('\n', p);
  return i < 0 ? v.length : i;
};
const lead = s => s.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;

// Enter inside a list item or quote continues it; Enter on an empty item ends the list.
export function continueList(value, pos) {
  const start = lineStart(value, pos),
    end = lineEnd(value, pos),
    line = value.slice(start, end);
  const m = line.match(LIST) || line.match(QUOTE);
  if (!m || pos - start < m[0].length) return null;
  if (!line.slice(m[0].length).trim() && pos === end) return { start, end, text: '', select: [start, start] };
  let marker = m[0];
  if (m[2]) {
    marker = m[1] + (m[3] ? String(Number(m[3]) + 1) + m[4] : m[2]) + m[5] + (m[6] ? '[ ] ' : '');
  }
  return {
    start: pos,
    end: pos,
    text: '\n' + marker,
    select: [pos + 1 + marker.length, pos + 1 + marker.length],
  };
}

// Tab nests list items under the previous sibling's text, which is what CommonMark requires; other lines move by two spaces.
export function indentLines(value, from, to, outdent = false) {
  const start = lineStart(value, from),
    end = lineEnd(value, to > from && value[to - 1] === '\n' ? to - 1 : to);
  const lines = value.slice(start, end).split('\n'),
    original = lines[0];
  if (from === to && !outdent && !LIST.test(lines[0]))
    return { start: from, end: to, text: '  ', select: [from + 2, from + 2] };
  const before = value.slice(0, start).split('\n');
  before.pop();
  const indent = lead(lines[0]);
  let target;
  if (LIST.test(lines[0])) {
    target = outdent ? Math.max(0, indent - 2) : indent + 2;
    for (let k = before.length - 1; k >= 0; k--) {
      const l = before[k];
      if (!l.trim()) continue;
      const m = l.match(LIST);
      if (!m) {
        if (lead(l) <= indent && !outdent) break;
        continue;
      }
      const ind = lead(l);
      if (!outdent && ind === indent) {
        target = ind + m[2].length + m[5].length;
        break;
      }
      if (outdent && ind < indent) {
        target = ind;
        break;
      }
      if (!outdent && ind < indent) break;
    }
  } else target = outdent ? Math.max(0, indent - 2) : indent + 2;
  const delta = target - indent;
  if (!delta) return { start: from, end: to, text: value.slice(from, to), select: [from, to] };
  // A nested ordered list must start at 1 to interrupt the parent item; an outdented one continues its new siblings.
  const first = lines[0].match(LIST);
  if (first?.[3]) {
    let n = 1;
    if (outdent)
      for (let k = before.length - 1; k >= 0; k--) {
        const m = before[k].match(LIST);
        if (m && lead(before[k]) === target) {
          n = m[3] ? Number(m[3]) + 1 : 1;
          break;
        }
        if (before[k].trim() && lead(before[k]) < target) break;
      }
    lines[0] = lines[0].replace(/\d{1,9}(?=[.)])/, String(n));
  }
  const next = lines.map(l => {
    if (!l.trim() && lines.length > 1) return l;
    if (delta > 0) return ' '.repeat(delta) + l;
    const ws = l.match(/^[ \t]*/)[0];
    let cut = 0,
      width = 0;
    while (cut < ws.length && width < -delta) {
      width += ws[cut] === '\t' ? 4 : 1;
      cut++;
    }
    return l.slice(cut);
  });
  const text = next.join('\n'),
    shift = next[0].length - original.length;
  const select =
    from === to
      ? [Math.max(start, from + shift), Math.max(start, from + shift)]
      : [start, start + text.length];
  return { start, end, text, select };
}

// Wrap the selection in a Markdown mark, or unwrap it when it is already wrapped.
export function wrapSelection(value, from, to, mark, placeholder) {
  const n = mark.length;
  if (
    value.slice(from - n, from) === mark &&
    value.slice(to, to + n) === mark &&
    (n > 1 || (value[from - 2] !== mark && value[to + 1] !== mark))
  )
    return { start: from - n, end: to + n, text: value.slice(from, to), select: [from - n, to - n] };
  const inner = value.slice(from, to) || placeholder;
  return { start: from, end: to, text: mark + inner + mark, select: [from + n, from + n + inner.length] };
}

export function insertLink(value, from, to, placeholder) {
  const label = value.slice(from, to) || placeholder,
    url = 'https://';
  const text = '[' + label + '](' + url + ')',
    at = from + label.length + 3;
  return {
    start: from,
    end: to,
    text,
    select: from === to ? [from + 1, from + 1 + label.length] : [at, at + url.length],
  };
}

// Literal, case-insensitive matching shared by find and replace in the source view.
export function findAll(value, query, limit = Infinity) {
  const hits = [];
  if (!query) return hits;
  const low = value.toLowerCase(),
    q = query.toLowerCase();
  if (low.length !== value.length) return exactFind(value, query, limit);
  let p = 0;
  while ((p = low.indexOf(q, p)) !== -1 && hits.length < limit) {
    hits.push(p);
    p += q.length;
  }
  return hits;
}
function exactFind(value, query, limit) {
  const hits = [];
  let p = 0;
  while ((p = value.indexOf(query, p)) !== -1 && hits.length < limit) {
    hits.push(p);
    p += query.length;
  }
  return hits;
}
export function replaceAll(value, query, replacement) {
  const hits = findAll(value, query);
  if (!hits.length) return { text: value, count: 0 };
  let out = '',
    last = 0;
  for (const p of hits) {
    out += value.slice(last, p) + replacement;
    last = p + query.length;
  }
  return { text: out + value.slice(last), count: hits.length };
}

// Words for the status bar: each CJK character counts as a word, as do runs of letters or digits elsewhere.
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g;
export function countWords(value) {
  const cjk = (value.match(CJK) || []).length;
  const words = (value.replace(CJK, ' ').match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) || []).length;
  const minutes = cjk + words ? Math.max(1, Math.round(cjk / 400 + words / 220)) : 0;
  return { words: cjk + words, minutes };
}
