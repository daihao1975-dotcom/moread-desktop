import { widthCSS, normalizeFont } from './preferences.js';
import { t, language, localizeMessage } from './i18n.js';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import deflist from 'markdown-it-deflist';
import abbr from 'markdown-it-abbr';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import mark from 'markdown-it-mark';
import { full as emoji } from 'markdown-it-emoji';
import codeCSS from 'highlight.js/styles/github.css?raw';
import documentCSS from './document.css?raw';
import fontNotice from './font-notice.txt?raw';
const escape = s =>
  String(s).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
// Raw HTML is untrusted. No resource can load until it has been explicitly replaced below.
export function sanitize(html) {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['eq', 'eqn'],
    ADD_ATTR: ['target'],
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'video',
      'audio',
      'source',
      'link',
      'style',
      'meta',
      'base',
    ],
    FORBID_ATTR: ['style', 'srcset', 'action', 'formaction'],
    ALLOW_DATA_ATTR: false,
  });
}
let highlighter, highlightPromise;
const loadHighlight = () =>
  (highlightPromise ??= import('./code-highlight.js')
    .then(module => {
      highlighter = module.default;
    })
    .catch(error => {
      highlightPromise = undefined;
      throw error;
    }));
function createMarkdown(highlight = true) {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight(str, lang) {
      if (lang === 'mermaid') return `<pre class="mermaid-source">${escape(str)}</pre>`;
      let code = escape(str);
      try {
        if (highlight && highlighter?.getLanguage(lang))
          code = highlighter.highlight(str, { language: lang }).value;
      } catch {}
      return `<pre class="code-block"><span class="code-language">${escape(lang || 'text')}</span><button class="copy-code" type="button">${escape(t('code.copy'))}</button><code class="hljs">${code}</code></pre>`;
    },
  })
    .use(footnote)
    .use(taskLists)
    .use(deflist)
    .use(abbr)
    .use(sub)
    .use(sup)
    .use(mark)
    .use(emoji);
  // Sanitize user HTML before plugins add trusted KaTeX layout styles.
  md.renderer.rules.html_block = (tokens, i) => sanitize(tokens[i].content);
  md.renderer.rules.html_inline = (tokens, i) => {
    const raw = tokens[i].content;
    const match = raw.match(/^<\/?([a-z][a-z0-9]*)\b/i);
    const safe = new Set([
      'u',
      'kbd',
      'span',
      'b',
      'i',
      'em',
      'strong',
      'sub',
      'sup',
      's',
      'del',
      'small',
      'abbr',
      'mark',
      'a',
      'code',
    ]);
    if (match && safe.has(match[1].toLowerCase())) {
      if (raw.startsWith('</')) return '</' + match[1].toLowerCase() + '>';
      const clean = sanitize(raw);
      return clean.replace(new RegExp('</' + match[1] + '>$', 'i'), '');
    }
    return sanitize(raw);
  };
  return md;
}
export const md = createMarkdown();
let mathPromise;
// Rendered with math only when the source could contain it.
const loadMath = () =>
  (mathPromise ??= import('./math.js')
    .then(m => ({ md: m.useMath(createMarkdown()), css: m.mathCSS }))
    .catch(error => {
      mathPromise = undefined;
      throw error;
    }));
export const hasMath = source => source.includes('$');
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'INPUT') {
    if (node.getAttribute('type') !== 'checkbox') {
      node.remove();
      return;
    }
    node.setAttribute('disabled', '');
    node.removeAttribute('name');
    node.removeAttribute('value');
  }
});
export function slug(s) {
  return (
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section'
  );
}
// Math styles and fonts are added only for documents that use math, which also keeps plain exports small.
export async function getCSS(math = false) {
  const base = documentCSS + '\n' + codeCSS;
  return math ? base + '\n' + (await loadMath()).css : base;
}
const CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export function page(body, css, theme = 'light', size = 16, width = 'auto', font = 'sans') {
  return `<!doctype html><html lang="${language()}" data-theme="${theme}" data-font="${normalizeFont(font)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(t('export.title'))}</title><style>${css.replace(/<\/style/gi, '<\\/style')}\n:root{--font-size:${Number(size)}px;--content-width:${widthCSS(width)}}</style></head><body><article>${body}</article>${css.includes('data:font/woff2') ? `<template id="katex-font-license">${escape(fontNotice)}</template>` : ''}</body></html>`;
}
const mermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  htmlLabels: false,
  maxTextSize: 30000,
  maxEdges: 200,
  flowchart: { htmlLabels: false },
  suppressErrorRendering: true,
};
// Diagrams are rendered for the reading theme so dark pages do not carry bright blocks.
let mermaidPromise,
  mermaidTheme = '';
async function loadMermaid(theme) {
  const mermaid = await (mermaidPromise ??= import('mermaid')
    .then(module => module.default)
    .catch(error => {
      mermaidPromise = undefined;
      throw error;
    }));
  const next = theme === 'dark' ? 'dark' : 'neutral';
  if (next !== mermaidTheme) {
    mermaid.initialize({ ...mermaidConfig, theme: next });
    mermaidTheme = next;
  }
  return mermaid;
}
let diagram = 0;
export async function renderDocument(
  source,
  {
    id = '',
    readImage = async () => '',
    isCurrent = () => true,
    theme = 'light',
    onPreview,
    deferred = false,
  } = {},
) {
  // Publish readable, sanitized text before optional engines or image I/O can block it.
  // The final pass still owns exports and keeps the same cancellation boundary.
  if (onPreview && (hasMath(source) || /!\[|<img\b|mermaid|`{3,}|~{3,}/i.test(source))) {
    const preview = await renderDocument(source, { id, isCurrent, theme, deferred: true });
    if (!preview || !isCurrent()) return null;
    await onPreview(preview);
    if (!isCurrent()) return null;
  }
  if (!deferred && /(?:`{3,}|~{3,})/.test(source)) {
    await loadHighlight();
    if (!isCurrent()) return null;
  }
  const math = !deferred && hasMath(source),
    engine = math ? (await loadMath()).md : deferred ? createMarkdown(false) : md;
  if (!isCurrent()) return null;
  const container = document.createElement('div');
  container.innerHTML = DOMPurify.sanitize(engine.render(source), {
    ADD_TAGS: ['eq', 'eqn'],
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'video',
      'audio',
      'source',
      'link',
      'style',
      'meta',
      'base',
    ],
    FORBID_ATTR: ['srcset', 'action', 'formaction'],
    ALLOW_DATA_ATTR: false,
  });
  const outline = [];
  const seen = new Set([...container.querySelectorAll('[id]')].map(node => node.id));
  for (const h of container.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const base = slug(h.textContent);
    let candidate = base,
      n = 0;
    while (seen.has(candidate)) candidate = base + '-' + ++n;
    h.id = candidate;
    seen.add(candidate);
    outline.push({ id: h.id, text: h.textContent, level: +h.tagName[1] });
  }
  for (const bq of container.querySelectorAll('blockquote')) {
    const p = bq.querySelector('p');
    if (p) {
      const m = p.textContent.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
      if (m) {
        bq.classList.add('alert', m[1].toLowerCase());
        p.innerHTML = p.innerHTML.replace(
          /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i,
          `<strong class="alert-title">${escape(t('alert.' + m[1].toLowerCase()))}</strong>`,
        );
      }
    }
  }
  // Cache only within this render: duplicates share I/O, later renders see disk edits.
  const imageSources = new Map();
  let imageChars = 0,
    imageBudgetExhausted = false;
  for (const img of container.querySelectorAll('img')) {
    const ref = img.getAttribute('src') || '';
    img.removeAttribute('src');
    img.removeAttribute('srcset');
    const remote = /^(https?:|\/\/)/i.test(ref);
    try {
      if (remote) throw new Error(t('img.remote'));
      if (!id) throw new Error(t('img.saveFirst'));
      if (deferred) throw new Error(t('state.opening'));
      if (imageBudgetExhausted) throw new Error(t('img.budget'));
      const uri = imageSources.get(ref) || (await readImage(id, ref));
      if (!isCurrent()) return null;
      if (!/^data:image\/(png|jpeg|gif|webp|avif|svg\+xml);base64,/.test(uri))
        throw new Error(t('img.format'));
      if (imageChars + uri.length > 32 * 1024 * 1024) {
        imageBudgetExhausted = true;
        throw new Error(t('img.budget'));
      }
      imageChars += uri.length;
      imageSources.set(ref, uri);
      img.src = uri;
      img.classList.add('zoomable');
      img.loading = 'eager';
    } catch (e) {
      const p = document.createElement(remote ? 'a' : 'span');
      p.className = 'image-placeholder';
      p.textContent = `▧ ${img.alt || t('img.default')} · ${remote ? t('img.remote') : localizeMessage(e.message || e)}`;
      if (remote && /^https?:/i.test(ref)) p.href = ref;
      img.replaceWith(p);
    }
  }
  for (const pre of container.querySelectorAll('.mermaid-source')) {
    if (deferred) continue;
    const text = pre.textContent;
    try {
      if (text.length > 30000 || /%%\s*\{|^\s*---|\b(click|icon|image)\b/im.test(text))
        throw new Error(t('diagram.unsupported'));
      const mermaid = await loadMermaid(theme);
      if (!isCurrent()) return null;
      const result = await mermaid.render('diagram-' + ++diagram, text);
      if (!isCurrent()) return null;
      const box = document.createElement('div');
      box.className = 'diagram';
      box.innerHTML = DOMPurify.sanitize(result.svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['foreignObject', 'script', 'image', 'a'],
        FORBID_ATTR: ['href', 'xlink:href', 'onload'],
        ALLOW_DATA_ATTR: false,
      });
      pre.replaceWith(box);
    } catch (e) {
      pre.className = 'render-error';
      pre.textContent = t('diagram.failed', { detail: localizeMessage(e.message || e) }) + '\n\n' + text;
    }
  }
  return { body: container.innerHTML, outline, math };
}
