// Markdown colouring for the source view. The textarea stays the real editor, so undo, input methods,
// selection and find keep their native behaviour; its text turns transparent over a coloured copy drawn
// behind it. Long documents skip the copy and show plain text, so typing never waits on it.
export const HIGHLIGHT_LIMIT = 150_000;
// A single malformed line can make inline regular expressions backtrack heavily. Keep such lines plain;
// this also bounds the work per match while normal paragraphs keep their colours.
const INLINE_LINE_LIMIT = 4096;

const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const span = (kind, s) => (s ? `<span class="md-${kind}">${esc(s)}</span>` : '');
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}#{1,6}(?=[ \t]|$)/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const MARKER = /^(?: {0,3}>[ \t]?)+|^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?(?=[ \t]|$)/;
const INLINE =
  /(`+)[^`\n]+?\1|!?\[[^\[\]\n]*\]\([^()\s]*(?:[ \t]+"[^"\n]*")?\)|\*\*[^\s*](?:[^*\n]*?[^\s*])?\*\*|__[^\s_](?:[^_\n]*?[^\s_])?__|\*[^\s*](?:[^*\n]*?[^\s*])?\*|<\/?[A-Za-z][^<>\n]*>/g;

const inlineKind = t =>
  t[0] === '`'
    ? 'code'
    : t[0] === '<'
      ? 'tag'
      : t[0] === '[' || t[0] === '!'
        ? 'link'
        : t[1] === t[0]
          ? 'strong'
          : 'em';

function inline(s) {
  if (s.length > INLINE_LINE_LIMIT || /`{65}/.test(s)) return esc(s);
  let out = '',
    at = 0;
  for (const m of s.matchAll(INLINE)) {
    out += esc(s.slice(at, m.index)) + span(inlineKind(m[0]), m[0]);
    at = m.index + m[0].length;
  }
  return out + esc(s.slice(at));
}

// highlightMarkdown returns markup with exactly the characters of text, so the copy lines up with the editor.
export function highlightMarkdown(text) {
  const lines = text.split('\n');
  let front = lines[0] === '---' && lines.indexOf('---', 1) > 0,
    fence = '';
  const out = lines.map((l, i) => {
    if (front) {
      if (i > 0 && l === '---') front = false;
      return span('meta', l);
    }
    const f = FENCE.exec(l);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !l.slice(f[0].length).trim())
        fence = '';
      return span('code', l);
    }
    if (f && !(f[1][0] === '`' && l.slice(f[0].length).includes('`'))) {
      fence = f[1];
      return span('code', l);
    }
    if (HEADING.test(l)) return span('heading', l);
    if (RULE.test(l)) return span('mark', l);
    const m = MARKER.exec(l);
    return m ? span('mark', m[0]) + inline(l.slice(m[0].length)) : inline(l);
  });
  // A trailing newline only gets a line box when something follows it.
  return out.join('\n') + (text.endsWith('\n') ? ' ' : '');
}

// createSourceHighlight keeps the coloured layer under the editor in step with its text, size and scroll.
export function createSourceHighlight(ed, layer, area) {
  let shown = null;
  const follow = () => {
    layer.scrollTop = ed.scrollTop;
    layer.scrollLeft = ed.scrollLeft;
  };
  const refresh = () => {
    const on = ed.value.length <= HIGHLIGHT_LIMIT;
    area.classList.toggle('highlighting', on);
    if (!on) {
      if (shown !== null) layer.replaceChildren();
      shown = null;
      return;
    }
    if (ed.value !== shown) {
      shown = ed.value;
      layer.innerHTML = highlightMarkdown(shown);
    }
    const cs = getComputedStyle(ed);
    for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) layer.style[p] = cs[p];
    Object.assign(layer.style, {
      left: ed.offsetLeft + 'px',
      top: ed.offsetTop + 'px',
      width: ed.clientWidth + 'px',
      height: ed.clientHeight + 'px',
    });
    follow();
  };
  ed.addEventListener('input', refresh);
  ed.addEventListener('scroll', follow, { passive: true });
  // Input methods draw their underline in the text colour, so the editor shows its own text while composing.
  ed.addEventListener('compositionstart', () => area.classList.add('composing'));
  ed.addEventListener('compositionend', () => {
    area.classList.remove('composing');
    refresh();
  });
  new ResizeObserver(refresh).observe(ed);
  return { refresh };
}
