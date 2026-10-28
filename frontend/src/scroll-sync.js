// Split view aligns both panes by heading; these mirror the preview-side helpers in frame-bootstrap.js.
const span = (tops, k, max) => [k < 0 ? 0 : tops[k], Math.min(k + 1 < tops.length ? tops[k + 1] : max, max)];
// locate turns an editor scroll offset into a heading section and the progress through it.
export const locate = (tops, y, max) => {
  let k = -1;
  while (k + 1 < tops.length && tops[k + 1] <= y) k++;
  const [a, b] = span(tops, k, max);
  return { section: k, progress: b > a ? Math.min(1, Math.max(0, (y - a) / (b - a))) : 0 };
};
// place is the inverse: the editor offset for a section and progress reported by the preview.
export const place = (tops, k, p, max) => {
  const [a, b] = span(tops, k, max);
  return a + Math.max(0, b - a) * p;
};
// Line numbers of ATX headings outside fenced code blocks.
export function sourceHeadingLines(lines) {
  const out = [];
  let fence = '';
  lines.forEach((l, i) => {
    const f = l.match(/^ {0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = '';
      return;
    }
    if (!fence && /^ {0,3}#{1,6}(\s|$)/.test(l)) out.push(i);
  });
  return out;
}
// A hidden mirror wraps text exactly like the textarea, so pixel positions of lines can be measured.
function mirrorOf(ed) {
  const cs = getComputedStyle(ed),
    m = document.createElement('div');
  for (const p of [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'tabSize',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'overflowWrap',
    'wordBreak',
  ])
    m.style[p] = cs[p];
  Object.assign(m.style, {
    position: 'absolute',
    visibility: 'hidden',
    left: '-99999px',
    top: '0',
    boxSizing: 'border-box',
    whiteSpace: 'pre-wrap',
    width: ed.clientWidth + 'px',
  });
  return m;
}
// Pixel top of a character offset in the textarea; very long texts fall back to counting lines.
export function caretTop(ed, text, pos) {
  if (text.length > 2e6) {
    const lh = parseFloat(getComputedStyle(ed).lineHeight) || 25;
    return (text.slice(0, pos).split('\n').length - 1) * lh;
  }
  const m = mirrorOf(ed),
    mark = document.createElement('span');
  m.append(text.slice(0, pos), mark);
  document.body.append(m);
  const top = mark.offsetTop;
  m.remove();
  return top;
}
// headingTops measures the pixel top of each heading line in the textarea, cached until the text, render or
// layout changes. It returns null when the source headings do not match the rendered outline.
export function headingTops() {
  let key = '',
    tops = null;
  return (ed, text, rendered) => {
    if (!rendered || text.length > 2e6) return null;
    const cs = getComputedStyle(ed),
      next = rendered.version + ':' + text.length + ':' + ed.clientWidth + ':' + cs.fontSize;
    if (next === key) return tops;
    key = next;
    tops = null;
    const lines = text.split('\n'),
      heads = sourceHeadingLines(lines);
    if (heads.length !== rendered.outline.length) return null;
    const m = mirrorOf(ed);
    const marks = [];
    let start = 0;
    for (const i of heads) {
      if (i > start) m.append(lines.slice(start, i).join('\n') + '\n');
      const s = document.createElement('span');
      m.append(s);
      marks.push(s);
      start = i;
    }
    m.append(lines.slice(start).join('\n'));
    document.body.append(m);
    tops = marks.map(s => s.offsetTop);
    m.remove();
    return tops;
  };
}
