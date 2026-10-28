// The printed table of contents. System printing cannot create PDF bookmarks, so an optional list of the
// headings ahead of the text is how readers find sections on paper; PDF viewers that keep links can jump too.
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// printTocHTML lists headings down to the third level below the top one; short documents get no page.
export function printTocHTML(outline, title) {
  const named = outline.filter(h => h.text.trim());
  const top = Math.min(...named.map(h => h.level));
  const items = named.filter(h => h.level - top < 3);
  if (items.length < 3) return '';
  const rows = items.map(
    h =>
      `<li class="toc-${h.level - top}"><a href="#${encodeURIComponent(h.id)}">${esc(h.text.trim())}</a></li>`,
  );
  return `<nav class="print-toc"><h2>${esc(title)}</h2><ol>${rows.join('')}</ol></nav>`;
}
