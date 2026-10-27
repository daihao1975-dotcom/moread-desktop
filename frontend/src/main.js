import { readRelativeDocument } from './relative-link.js';
import { readLineEndings, editLineEndings, writeLineEndings } from './line-endings.js';
import { readPreferences, normalizeWidth, resolveTheme } from './preferences.js';
import { bindTitlebar } from './titlebar.js';
import { documentTransition } from './document-transition.js';
import { initializeDocuments } from './initial-documents.js';
import { LANGUAGES, matchLanguage, setLanguage, language, t, translate, localizeMessage } from './i18n.js';
import { bindTooltips } from './tooltip.js';
import {
  continueList,
  indentLines,
  wrapSelection,
  insertLink,
  findAll,
  replaceAll,
  countWords,
} from './editing.js';
import { version } from '../package.json';
import './style.css';
import brandIcon from './assets/icon.png';
import {
  createIcons,
  PanelLeft,
  FilePlus,
  FolderOpen,
  FileText,
  Save,
  Search,
  SlidersHorizontal,
  Maximize2,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide';
import { sample, welcome } from './sample.js';
import { createFrame } from './frame.js';
import { renderDocument, getCSS, page } from './render.js';
const $ = s => document.querySelector(s),
  app = $('#app');
const icon = name => `<i data-lucide="${name}"></i>`;
const isMac = /Mac/.test(navigator.userAgent),
  mod = isMac ? '⌘' : 'Ctrl+';
let prefs = readPreferences();
try {
  prefs = readPreferences(JSON.parse(localStorage.getItem('moread-preferences') || '{}'));
} catch {}
const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
const activeTheme = () => resolveTheme(prefs.theme, !!darkQuery?.matches);
const preferredLanguage = () =>
  prefs.lang === 'auto'
    ? matchLanguage(navigator.languages?.length ? navigator.languages : [navigator.language])
    : matchLanguage([prefs.lang]);
setLanguage(preferredLanguage());
// Static labels carry data-i18n keys; translate() fills them now and again after a language switch.
const tool = (id, name, key, shortcut) =>
  `<button id="${id}" class="icon-button" data-i18n-title="${key}${shortcut ? '|' + shortcut : ''}" data-i18n-label="${key}">${icon(name)}</button>`;
if (isMac && window.runtime) document.body.classList.add('mac');
app.innerHTML = `<header class="topbar"><div class="toolbar">${tool('toggle-side', 'panel-left', 'tb.sidebar')}<div class="divider"></div>${tool('open', 'file-text', 'tb.open', mod + 'O')}${tool('folder', 'folder-open', 'tb.folder')}${tool('new', 'file-plus', 'tb.new', mod + 'N')}${tool('save', 'save', 'tb.save', mod + 'S')}<div class="doc-title"><span class="document-name" id="doc-name"></span><span class="doc-state" id="doc-state"></span></div></div>
<div class="segmented"><button data-mode="read" class="active" data-i18n="mode.read" data-i18n-title="mode.read|${mod}1"></button><button data-mode="source" data-i18n="mode.source" data-i18n-title="mode.source|${mod}2"></button><button data-mode="split" data-i18n="mode.split" data-i18n-title="mode.split|${mod}3"></button></div>
<div class="toolbar toolbar-end">${tool('find', 'search', 'tb.find', mod + 'F')}${tool('focus', 'maximize-2', 'tb.focus', 'Esc')}${tool('settings-toggle', 'sliders-horizontal', 'tb.settings', mod + ',')}</div></header>
<div class="workspace"><aside id="sidebar"><div class="side-tabs"><button data-tab="files" class="active" data-i18n="side.files"></button><button data-tab="outline" data-i18n="side.outline"></button></div><div class="filter-wrap"><input id="filter" data-i18n-placeholder="side.filter" data-i18n-label="side.filter"></div><nav class="side-list" id="side-list"></nav><div class="side-footer"><img src="${brandIcon}" alt=""><b data-i18n="app.name"></b><span data-i18n="side.footer"></span></div></aside>
<main><div class="findbar" id="findbar"><div class="find-row"><input id="query" data-i18n-placeholder="find.placeholder" data-i18n-label="find.placeholder"><span id="match-count" aria-live="polite"></span><button id="prev-match" data-i18n-title="find.prev|Shift+Enter" data-i18n-label="find.prev">${icon('chevron-up')}</button><button id="next-match" data-i18n-title="find.next|Enter" data-i18n-label="find.next">${icon('chevron-down')}</button><span class="grow"></span><button id="close-find" data-i18n-title="find.close|Esc" data-i18n-label="find.close">${icon('x')}</button></div><div class="replace-row"><input id="replacement" data-i18n-placeholder="replace.placeholder" data-i18n-label="replace.placeholder"><button id="replace-one" class="text-button" data-i18n="replace.one"></button><button id="replace-all" class="text-button" data-i18n="replace.all"></button></div></div>
<div class="view-area"><textarea id="editor" data-i18n-label="editor.label" spellcheck="false" class="hidden"></textarea><div class="splitter" id="splitter" role="separator" aria-orientation="vertical" data-i18n-label="splitter.label" tabindex="0"></div><iframe id="preview" data-i18n-title="preview.title" sandbox="allow-scripts"></iframe></div></main></div>
<footer class="statusbar"><span><b class="online-dot"></b><span data-i18n="status.offline"></span></span><span id="encoding"></span><span id="words"></span><span class="grow"></span><span id="render-status"></span><span id="app-version"></span></footer>
<div class="settings" id="settings"><div class="setting-title" data-i18n="settings.theme"></div><div class="theme-options"><button data-theme="auto" data-i18n="theme.auto"></button><button data-theme="light" data-i18n="theme.light"></button><button data-theme="paper" data-i18n="theme.paper"></button><button data-theme="dark" data-i18n="theme.dark"></button></div>
<div class="setting-row"><span><span data-i18n="settings.size"></span> <b id="size-label"></b></span><input id="font-size" type="range" min="13" max="24" data-i18n-label="settings.size"></div>
<div class="setting-row"><span data-i18n="settings.width"></span><select id="width"><option value="auto" data-i18n="width.auto"></option><option value="720" data-i18n="width.720"></option><option value="860" data-i18n="width.860"></option><option value="1040" data-i18n="width.1040"></option></select></div>
<div class="setting-row"><span data-i18n="settings.language"></span><select id="language"><option value="auto" data-i18n="lang.auto"></option>${LANGUAGES.map(([tag, name]) => `<option value="${tag}" lang="${tag}">${name}</option>`).join('')}</select></div><p class="setting-hint"></p></div>
<dialog id="dirty-dialog"><h2 data-i18n="dirty.title"></h2><p data-i18n="dirty.body"></p><div class="dialog-actions"><button data-answer="cancel" data-i18n="dirty.cancel"></button><button data-answer="discard" data-i18n="dirty.discard"></button><button data-answer="save" class="primary" data-i18n="dirty.save"></button></div></dialog>
<dialog id="shortcuts-dialog" class="shortcuts-dialog"><div class="dialog-heading"><h2 data-i18n="shortcuts.title"></h2><span class="grow"></span><button id="shortcuts-close" data-i18n="shortcuts.close"></button></div><div id="shortcut-list"></div></dialog>
<div class="zoom" id="zoom"><button data-i18n-title="zoom.close|Esc" data-i18n-label="zoom.close">${icon('x')}</button><img data-i18n-alt="zoom.alt"></div>`;
const aboutDialog = document.createElement('dialog');
aboutDialog.className = 'about-dialog';
aboutDialog.innerHTML = `<div class="about-heading"><img src="${brandIcon}" alt=""><div><h2>墨阅 MoRead</h2><p data-i18n="app.producer"></p></div><span class="grow"></span><button id="about-close" data-i18n="about.close"></button></div><dl id="build-details"></dl><details class="advanced-diagnostics"><summary data-i18n="about.diagnostics"></summary><pre id="open-timing"></pre><div class="isolation-check"><button id="check-isolation" data-i18n="about.check"></button><span id="isolation-result"></span></div></details><div class="about-tabs"><button data-license="own" class="active" data-i18n="about.own"></button><button data-license="thirdParty" data-i18n="about.thirdParty"></button><button data-license="brand" data-i18n="about.brand"></button></div><textarea id="license-text" readonly data-i18n-label="about.licenseLabel" spellcheck="false"></textarea>`;
document.body.append(aboutDialog);
let licenseTexts = {},
  isolationBusy = false,
  closeInFlight = false,
  closeApproved = false;
$('#about-close').onclick = () => aboutDialog.close();
aboutDialog.querySelectorAll('[data-license]').forEach(
  b =>
    (b.onclick = () => {
      aboutDialog.querySelectorAll('[data-license]').forEach(t => t.classList.toggle('active', t === b));
      $('#license-text').value = licenseTexts[b.dataset.license] || '';
      $('#license-text').scrollTop = 0;
    }),
);
$('#shortcuts-close').onclick = () => $('#shortcuts-dialog').close();
bindTitlebar($('.topbar'), window.runtime);
const tooltips = bindTooltips(document);
const printHost = document.createElement('div');
printHost.id = 'print-content';
document.body.append(printHost);
createIcons({
  icons: {
    PanelLeft,
    FilePlus,
    FolderOpen,
    FileText,
    Save,
    Search,
    SlidersHorizontal,
    Maximize2,
    ChevronUp,
    ChevronDown,
    X,
  },
});
// builtin marks the welcome page and the full example, which follow the interface language until edited.
const builtinDocument = kind => ({
  id: '',
  name: t('doc.welcome'),
  content: kind === 'sample' ? sample() : welcome(),
  encoding: 'UTF-8',
  hash: '',
  builtin: kind,
});
let current = builtinDocument('welcome'),
  baseline = current.content,
  source = current.content,
  files = [],
  outline = [],
  sideTab = 'files',
  mode = 'read',
  version_ = 0,
  timer,
  rendered = null,
  resetScroll = true,
  saveBusy = false,
  opening = false,
  toastTimer,
  newline = '\n',
  lineEndings = [],
  baselineEndings = [],
  queue = Promise.resolve(),
  findHits = [],
  findIndex = -1,
  findCycling = false,
  replacing = false,
  windowTitle = '',
  lastAction = { name: '', at: 0 },
  pendingAnchor = '',
  currentHeading = '',
  scrollLead = '',
  scrollLeadAt = 0,
  renderedTheme = '',
  countTimer,
  externalNotice = '';
const native = () => window.go?.main?.App;
async function call(name, ...args) {
  if (!native()) throw new Error(t('toast.desktopOnly'));
  return native()[name](...args);
}
function toast(msg, error = false) {
  $('.toast')?.remove();
  const d = document.createElement('div');
  d.className = 'toast' + (error ? ' error' : '');
  d.setAttribute('role', error ? 'alert' : 'status');
  d.textContent = localizeMessage(msg?.message ?? msg);
  document.body.append(d);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => d.remove(), error ? 7000 : 3500);
}
const dirty = () => source !== baseline;
function stateLabel() {
  if (opening) return t('state.opening');
  if (dirty()) return t('state.unsaved');
  if (current.id) return t('state.saved');
  return current.builtin ? t('state.sample') : t('state.untitled');
}
function update() {
  app.classList.toggle('dirty', dirty());
  $('#doc-name').textContent = current.name;
  $('#doc-state').textContent = stateLabel();
  $('#encoding').textContent =
    current.encoding + (newline === '\r\n' ? ' · CRLF' : newline === '\r' ? ' · CR' : ' · LF');
  $('#save').disabled = saveBusy || opening;
  const title = (dirty() ? '• ' : '') + current.name + ' — ' + t('app.name');
  if (title !== windowTitle) {
    windowTitle = title;
    document.title = title;
    window.runtime?.WindowSetTitle?.(title);
  }
  countLater();
}
// Counting a long document on every keystroke is wasteful; the status bar settles shortly after typing stops.
function countLater(delay = 300) {
  clearTimeout(countTimer);
  countTimer = setTimeout(() => {
    const c = countWords(source);
    $('#words').textContent = t('status.count', { n: c.words.toLocaleString(language()), m: c.minutes });
  }, delay);
}
function savePrefs() {
  try {
    localStorage.setItem('moread-preferences', JSON.stringify(prefs));
  } catch {}
}
function applyPrefs() {
  const theme = activeTheme();
  document.body.dataset.theme = theme;
  $('.view-area').style.setProperty('--split', prefs.split + '%');
  $('#splitter').setAttribute('aria-valuenow', prefs.split);
  $('#sidebar').classList.toggle('hidden', !prefs.sidebar);
  $('#font-size').value = prefs.size;
  $('#size-label').textContent = prefs.size;
  $('#width').value = prefs.width;
  $('#language').value = prefs.lang;
  document
    .querySelectorAll('.theme-options button')
    .forEach(b => b.classList.toggle('active', b.dataset.theme === prefs.theme));
  savePrefs();
  document.documentElement.style.setProperty('--editor-size', Math.max(13, prefs.size - 2) + 'px');
  syncToggles();
  previewFrame?.prefs({ theme, size: prefs.size, width: prefs.width }).catch(e => toast(e, true));
  // Apply the new theme first, then redraw diagrams in the matching palette.
  if (renderedTheme && (renderedTheme === 'dark') !== (theme === 'dark') && hasDiagram()) scheduleRender(0);
}
darkQuery?.addEventListener?.('change', () => {
  if (prefs.theme === 'auto') applyPrefs();
});
function relabel() {
  tooltips.hide();
  translate(document);
  $('.setting-hint').textContent = t('settings.hint', { menu: isMac ? t('menu.app') : t('menu.help') });
  $('#app-version').textContent = t('status.version', { v: version });
  buildShortcuts();
  update();
  side();
  syncToggles();
  countLater(0);
}
// Switch the interface, native menus and built-in pages together; an edited document is never replaced.
function applyLanguage() {
  setLanguage(preferredLanguage());
  if (native()) call('SetLanguage', language()).catch(e => toast(e, true));
  if (current.untitled) current = { ...current, name: t('doc.untitled') };
  relabel();
  if (current.builtin && !dirty() && !opening) useDocument(builtinDocument(current.builtin), true);
  else scheduleRender(0);
}
addEventListener('languagechange', () => {
  if (prefs.lang === 'auto') applyLanguage();
});
function side() {
  const list = $('#side-list');
  list.replaceChildren();
  $('#filter').parentElement.classList.toggle('hidden', sideTab !== 'files');
  document
    .querySelectorAll('[data-tab]')
    .forEach(b => b.classList.toggle('active', b.dataset.tab === sideTab));
  const note = text => {
    const p = document.createElement('p');
    p.className = 'empty-side';
    p.textContent = text;
    list.append(p);
  };
  if (sideTab === 'outline') {
    if (!outline.length) note(t('side.outlineEmpty'));
    for (const h of outline) {
      const b = document.createElement('button');
      b.className = 'outline-row' + (h.id === currentHeading ? ' active' : '');
      b.dataset.id = h.id;
      b.textContent = h.text;
      b.style.paddingLeft = 12 + (h.level - 1) * 12 + 'px';
      b.onclick = () => {
        if (mode === 'source') setMode('split');
        previewFrame.anchor(h.id).catch(e => toast(e, true));
      };
      list.append(b);
    }
    return;
  }
  const shown = files.filter(f =>
    (f.relative || f.name).toLowerCase().includes($('#filter').value.toLowerCase()),
  );
  if (!shown.length) {
    if (files.length) note(t('side.noMatch'));
    else {
      const box = document.createElement('div');
      box.className = 'empty-side';
      const p = document.createElement('p');
      p.textContent = t('side.emptyHint');
      box.append(p);
      for (const [action, key, cls] of [
        ['folder', 'side.openFolder', 'primary'],
        ['open', 'side.openFile', ''],
        ['sample', 'side.sample', 'link'],
      ]) {
        const b = document.createElement('button');
        b.className = ('empty-action ' + cls).trim();
        b.textContent = t(key);
        b.onclick = () => runAction(action);
        box.append(b);
      }
      list.append(box);
    }
  }
  for (const f of shown) {
    const b = document.createElement('button');
    b.className = 'file-row' + (f.id === current.id ? ' active' : '');
    b.textContent = f.relative || f.name;
    b.dataset.tip = f.relative || f.name;
    b.onclick = () => enqueue(() => activate(f));
    list.append(b);
  }
}
function setMode(v) {
  mode = v;
  if (v === 'read' && replacing) {
    replacing = false;
    $('#findbar').classList.remove('replacing');
  }
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === v));
  $('.view-area').classList.toggle('split', v === 'split');
  $('#editor').classList.toggle('hidden', v === 'read');
  $('#preview').classList.toggle('hidden', v === 'source');
  if (v !== 'read') $('#editor').focus();
  if (v !== 'source') scheduleRender(0);
  clearFind();
}
function enqueue(fn) {
  queue = queue.then(fn).catch(e => toast(e, true));
  return queue;
}
function choice() {
  return new Promise(resolve => {
    const d = $('#dirty-dialog');
    d.showModal();
    const finish = a => {
      d.close();
      d.onclick = null;
      d.oncancel = null;
      resolve(a);
    };
    d.onclick = e => {
      const a = e.target.closest('[data-answer]')?.dataset.answer;
      if (a) finish(a);
    };
    d.oncancel = e => {
      e.preventDefault();
      finish('cancel');
    };
  });
}
async function guard() {
  if (saveBusy) {
    toast(t('toast.saveBusy'));
    return false;
  }
  if (!dirty()) return true;
  const a = await choice();
  if (a === 'cancel') return false;
  if (a === 'save') return await save(false);
  return true;
}
function setOpening(value) {
  opening = value;
  $('#editor').disabled = value;
  update();
}
function switchDocument(load, valid) {
  return documentTransition({ guard, load, valid, apply: useDocument, setOpening });
}
function useDocument(d, keepScroll = false) {
  current = d;
  currentHeading = '';
  pendingAnchor = d.navigationAnchor || '';
  const text = readLineEndings(d.content);
  newline = text.preferred;
  lineEndings = text.endings;
  baselineEndings = [...lineEndings];
  source = text.text;
  baseline = source;
  $('#editor').value = source;
  resetScroll = !keepScroll;
  clearFind();
  update();
  side();
  scheduleRender(0);
}
async function activate(d, force = false) {
  if (d.id === current.id && !force) return;
  await switchDocument(() => call('ReadDocument', d.id));
}
async function addResult(r) {
  if (r?.skipped?.length) toast(t('toast.skipped') + '\n' + r.skipped.slice(0, 5).join('\n'), true);
  const ds = r?.documents || [];
  const seen = new Map(files.map(d => [d.id, d]));
  for (const d of ds) seen.set(d.id, d);
  files = [...seen.values()].sort((a, b) =>
    (a.relative || a.name).localeCompare(b.relative || b.name, language()),
  );
  side();
  if (ds.length) await activate(ds[0], true);
}
async function save(as) {
  if (saveBusy || opening) return false;
  saveBusy = true;
  update();
  const text = source;
  const savedEndings = [...lineEndings];
  try {
    const r = await call(
      'SaveDocument',
      current.id,
      writeLineEndings(text, savedEndings, newline),
      current.hash,
      current.encoding,
      as,
    );
    if (r.cancelled) return false;
    current = { ...r.document, content: source };
    baseline = text;
    baselineEndings = savedEndings;
    externalNotice = '';
    if (!files.some(f => f.id === current.id)) files.push(current);
    side();
    update();
    toast(source === text ? t('toast.saved') : t('toast.savedMore'));
    return source === text;
  } catch (e) {
    toast(e, true);
    return false;
  } finally {
    saveBusy = false;
    update();
  }
}
// Longer documents wait a little longer after typing before they are rendered again.
function scheduleRender(delay = Math.min(1200, 220 + source.length / 5000)) {
  clearTimeout(timer);
  const v = ++version_;
  previewFrame.begin(v);
  timer = setTimeout(() => render(v), delay);
}
async function render(v) {
  $('#render-status').textContent = t('status.rendering');
  try {
    const theme = activeTheme();
    let previewShown = false,
      paintReported = false;
    const documentID = current.id;
    const reportPaint = async () => {
      if (paintReported || !documentID || mode === 'source' || document.hidden) return;
      // The first callback precedes a paint; the second follows that paint opportunity.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (v !== version_) return;
      paintReported = true;
      const timing = await previewFrame.paintTiming();
      if (v !== version_ || timing.cancelled) return;
      call('ReportDocumentPaint', documentID, timing.firstContentfulPaintAt || 0).catch(() => {});
    };
    const r = await renderDocument(source, {
      id: current.id,
      readImage: (...args) => call('ReadImage', ...args),
      isCurrent: () => v === version_,
      theme,
      onPreview: !resetScroll
        ? undefined
        : async preview => {
            if (v !== version_) return;
            const css = await getCSS(false);
            if (v !== version_) return;
            const result = await previewFrame.render(preview.body, css, {
              reset: resetScroll,
              theme,
              size: prefs.size,
              width: prefs.width,
            });
            if (v !== version_ || result.cancelled) return;
            previewShown = true;
            outline = preview.outline;
            side();
            await reportPaint();
          },
    });
    if (v !== version_ || !r) return;
    const css = await getCSS(r.math);
    if (v !== version_) return;
    const result = await previewFrame.render(r.body, css, {
      reset: resetScroll && !previewShown,
      theme,
      size: prefs.size,
      width: prefs.width,
    });
    if (v !== version_ || result.cancelled) return;
    await reportPaint();
    if (v !== version_) return;
    rendered = { ...r, css, version: v };
    renderedTheme = theme;
    if (pendingAnchor) {
      const anchor = pendingAnchor;
      const navigated = await previewFrame.anchor(anchor);
      if (v !== version_ || navigated?.cancelled) return;
      pendingAnchor = '';
    }
    outline = r.outline;
    resetScroll = false;
    side();
    $('#render-status').textContent = '';
    if ($('#findbar').classList.contains('open') && !sourceFind()) runFind(false);
  } catch (e) {
    if (v === version_) {
      $('#render-status').textContent = t('status.renderFailed');
      toast(e, true);
    }
  }
}
async function previewAction(action) {
  const expectedId = current.id,
    expectedVersion = version_;
  const valid = () =>
    current.id === expectedId && version_ === expectedVersion && previewFrame.current(action.version);
  if (!valid()) return;
  if (action.kind === 'copy') {
    try {
      if (window.runtime?.ClipboardSetText) await window.runtime.ClipboardSetText(action.value);
      else await navigator.clipboard.writeText(action.value);
      if (valid()) await previewFrame.copyResult(action.id, true);
    } catch (e) {
      if (valid()) await previewFrame.copyResult(action.id, false);
      toast(t('toast.copyFailed'), true);
    }
    return;
  }
  if (action.kind === 'zoom') {
    $('#zoom img').src = action.value;
    $('#zoom').classList.add('open');
    return;
  }
  const href = action.value;
  if (href.startsWith('#')) {
    try {
      await previewFrame.anchor(decodeURIComponent(href.slice(1)));
    } catch (e) {
      toast(e, true);
    }
    return;
  }
  if (/^https?:|^mailto:/i.test(href)) {
    try {
      if (valid()) await call('OpenLink', href);
    } catch (e) {
      toast(e, true);
    }
    return;
  }
  enqueue(async () => {
    if (!valid()) return;
    await switchDocument(async () => {
      const result = await readRelativeDocument(expectedId, href, call, valid);
      if (!result || !valid()) return null;
      if (!files.some(f => f.id === result.registered.id)) files.push(result.registered);
      return result.document;
    }, valid);
  });
}
// Find runs in the reading pane, except in the source view or while replacing, where it works on the Markdown text.
const sourceFind = () => mode === 'source' || replacing;
function clearFind() {
  findHits = [];
  findIndex = -1;
  findCycling = false;
  $('#match-count').textContent = '';
  previewFrame?.clearFind().catch(e => toast(e, true));
}
function countLabel(count, index) {
  return count
    ? index >= 0
      ? t('find.position', { i: (index + 1).toLocaleString(language()), n: count.toLocaleString(language()) })
      : t('find.count', { n: count.toLocaleString(language()) })
    : t('find.none');
}
function showSourceHit(i, focus) {
  const ed = $('#editor'),
    q = $('#query').value,
    p = findHits[i];
  findIndex = i;
  if (focus) {
    ed.focus();
    findCycling = true;
  }
  ed.setSelectionRange(p, p + q.length);
  ed.scrollTop = Math.max(0, caretTop(p) - ed.clientHeight / 3);
  $('#match-count').textContent = countLabel(findHits.length, i);
}
async function runFind(move = true) {
  const q = $('#query').value;
  if (sourceFind()) {
    findHits = findAll(source, q, 2000);
    findIndex = -1;
    if (!q) {
      $('#match-count').textContent = '';
      return;
    }
    if (!findHits.length) {
      $('#match-count').textContent = t('find.none');
      return;
    }
    if (move) {
      const from = $('#editor').selectionStart,
        i = findHits.findIndex(p => p >= from);
      showSourceHit(i < 0 ? 0 : i, false);
    } else $('#match-count').textContent = countLabel(findHits.length, -1);
    return;
  }
  const v = version_;
  try {
    const result = await previewFrame.find(q, move);
    if (v !== version_ || result.cancelled) return;
    findHits = Array.from({ length: result.count });
    findIndex = result.index;
    $('#match-count').textContent = q ? countLabel(result.count, result.index) : '';
  } catch (e) {
    toast(e, true);
  }
}
async function nextMatch(delta) {
  if (!findHits.length) {
    $('#match-count').textContent = $('#query').value ? t('find.none') : '';
    return;
  }
  if (sourceFind()) {
    const n = findHits.length;
    showSourceHit(findIndex < 0 ? (delta > 0 ? 0 : n - 1) : (findIndex + delta + n) % n, true);
    return;
  }
  try {
    const result = await previewFrame.next(delta);
    if (result.cancelled) return;
    findIndex = result.index;
    $('#match-count').textContent = countLabel(result.count, result.index);
  } catch (e) {
    toast(e, true);
  }
}
function replaceCurrent() {
  const q = $('#query').value;
  if (!q || !findHits.length) {
    toast(t('replace.nothing'));
    return;
  }
  const r = $('#replacement').value,
    p = findHits[findIndex < 0 ? 0 : findIndex];
  applyEdit({ start: p, end: p + q.length, text: r, select: [p + r.length, p + r.length] });
  if (!findHits.length) {
    $('#match-count').textContent = t('find.none');
    return;
  }
  const after = findHits.findIndex(h => h >= p + r.length);
  showSourceHit(after < 0 ? 0 : after, true);
}
function replaceEvery() {
  const q = $('#query').value,
    { text, count } = replaceAll(source, q, $('#replacement').value);
  if (!q || !count) {
    toast(t('replace.nothing'));
    return;
  }
  const ed = $('#editor'),
    top = ed.scrollTop;
  applyEdit({ start: 0, end: source.length, text, select: [0, 0] });
  ed.scrollTop = top;
  toast(t('replace.done', { n: count.toLocaleString(language()) }));
}
// Edits go through insertText so the native undo stack keeps working; setRangeText is the fallback.
function applyEdit(c) {
  const ed = $('#editor');
  if (!c || ed.disabled) return;
  if (ed.value.slice(c.start, c.end) === c.text) {
    ed.setSelectionRange(...c.select);
    return;
  }
  ed.focus();
  ed.setSelectionRange(c.start, c.end);
  const ok = c.text ? document.execCommand('insertText', false, c.text) : document.execCommand('delete');
  if (!ok || ed.value.slice(c.start, c.start + c.text.length) !== c.text) {
    ed.setRangeText(c.text, c.start, c.end, 'end');
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }
  ed.setSelectionRange(...c.select);
}
function formatSource(kind) {
  if (mode === 'read') {
    toast(t('toast.editHint'));
    return;
  }
  const ed = $('#editor');
  if (ed.disabled) return;
  const v = ed.value,
    s = ed.selectionStart,
    e = ed.selectionEnd;
  applyEdit(
    kind === 'indent' || kind === 'outdent'
      ? indentLines(v, s, e, kind === 'outdent')
      : kind === 'link'
        ? insertLink(v, s, e, t('fmt.link'))
        : wrapSelection(v, s, e, { bold: '**', italic: '*', code: '`' }[kind], t('fmt.' + kind)),
  );
}
function setFontSize(v) {
  prefs.size = Math.min(24, Math.max(13, v));
  applyPrefs();
}
function syncToggles() {
  const focus = document.body.classList.contains('focus');
  for (const [id, on] of [
    ['toggle-side', prefs.sidebar],
    ['find', $('#findbar').classList.contains('open')],
    ['focus', focus],
    ['settings-toggle', $('#settings').classList.contains('open')],
  ]) {
    $('#' + id).classList.toggle('on', on);
    $('#' + id).setAttribute('aria-pressed', String(on));
  }
  $('#focus').dataset.tip = focus ? t('tb.focusExit') + ' (Esc)' : t('tb.focus') + ' (Esc)';
  tooltips?.refresh();
}
function toggleSettings(open = !$('#settings').classList.contains('open')) {
  $('#settings').classList.toggle('open', open);
  syncToggles();
}
function toggleFocus(on = !document.body.classList.contains('focus')) {
  document.body.classList.toggle('focus', on);
  syncToggles();
  if (on) toast(t('toast.focus'));
}
function toggleFind(open = true, withReplace = false) {
  if (open && withReplace && mode === 'read') setMode('split');
  replacing = open && withReplace;
  $('#findbar').classList.toggle('replacing', replacing);
  $('#findbar').classList.toggle('open', open);
  syncToggles();
  if (open) {
    $('#query').focus();
    $('#query').select();
    runFind(false);
  } else clearFind();
}
function buildShortcuts() {
  const m = isMac ? '⌘' : 'Ctrl',
    sh = isMac ? '⇧' : 'Shift',
    alt = isMac ? '⌥' : 'Alt';
  const groups = [
    [
      'shortcuts.files',
      [
        ['shortcuts.open', [m, 'O']],
        ['shortcuts.new', [m, 'N']],
        ['shortcuts.save', [m, 'S']],
        ['shortcuts.saveAs', [m, sh, 'S']],
        ['shortcuts.print', [m, 'P']],
      ],
    ],
    [
      'shortcuts.editing',
      [
        ['shortcuts.bold', [m, 'B']],
        ['shortcuts.italic', [m, 'I']],
        ['shortcuts.code', [m, 'E']],
        ['shortcuts.link', [m, 'K']],
        ['shortcuts.indent', ['Tab', '/', sh, 'Tab']],
        ['shortcuts.list', ['Enter']],
        ['shortcuts.find', [m, 'F']],
        ['shortcuts.replace', isMac ? [m, alt, 'F'] : [m, 'H']],
      ],
    ],
    [
      'shortcuts.viewing',
      [
        ['shortcuts.modes', [m, '1', '/', '2', '/', '3']],
        ['shortcuts.fontSize', [m, '=', '/', '-', '/', '0']],
        ['shortcuts.settings', [m, ',']],
        ['shortcuts.help', [m, '/']],
        ['shortcuts.escape', ['Esc']],
      ],
    ],
  ];
  const list = $('#shortcut-list');
  list.replaceChildren();
  for (const [title, rows] of groups) {
    const section = document.createElement('section'),
      h = document.createElement('h3');
    h.textContent = t(title);
    section.append(h);
    for (const [label, keys] of rows) {
      const row = document.createElement('div'),
        name = document.createElement('span'),
        combo = document.createElement('span');
      row.className = 'shortcut-row';
      name.textContent = t(label);
      combo.className = 'keys';
      keys.forEach((k, i) => {
        if (k === '/' && i > 0 && i < keys.length - 1) {
          combo.append(' / ');
          return;
        }
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        combo.append(kbd);
      });
      row.append(name, combo);
      section.append(row);
    }
    list.append(section);
  }
}
async function snapshot() {
  clearTimeout(timer);
  const v = ++version_;
  previewFrame.begin(v);
  await render(v);
  if (!rendered || rendered.version !== version_) throw new Error(t('toast.notRendered'));
  const clean = document.createElement('div');
  clean.innerHTML = rendered.body;
  clean.querySelectorAll('.copy-code').forEach(b => b.remove());
  return page(clean.innerHTML, rendered.css, activeTheme(), prefs.size, prefs.width);
}
$('#open').onclick = () => enqueue(async () => addResult(await call('OpenFiles')));
$('#folder').onclick = () => enqueue(async () => addResult(await call('OpenFolder')));
$('#new').onclick = () =>
  enqueue(async () => {
    if (!(await guard())) return;
    useDocument({
      id: '',
      name: t('doc.untitled'),
      content: '',
      encoding: 'UTF-8',
      hash: '',
      untitled: true,
    });
    setMode('split');
  });
const loadSample = () =>
  enqueue(async () => {
    if (await guard()) useDocument(builtinDocument('sample'));
  });
$('#save').onclick = () => save(false);
$('#toggle-side').onclick = () => {
  prefs.sidebar = !prefs.sidebar;
  applyPrefs();
};
$('#focus').onclick = () => toggleFocus();
$('#settings-toggle').onclick = () => toggleSettings();
document.addEventListener('click', e => {
  if (!e.target.closest('#settings,#settings-toggle') && $('#settings').classList.contains('open'))
    toggleSettings(false);
});
document.querySelectorAll('[data-mode]').forEach(b => (b.onclick = () => setMode(b.dataset.mode)));
document.querySelectorAll('[data-tab]').forEach(
  b =>
    (b.onclick = () => {
      sideTab = b.dataset.tab;
      side();
    }),
);
document.querySelectorAll('.theme-options button').forEach(
  b =>
    (b.onclick = () => {
      prefs.theme = b.dataset.theme;
      applyPrefs();
    }),
);
$('#font-size').oninput = e => {
  prefs.size = +e.target.value;
  applyPrefs();
};
$('#width').onchange = e => {
  prefs.width = normalizeWidth(e.target.value);
  applyPrefs();
};
$('#language').onchange = e => {
  prefs.lang = e.target.value;
  savePrefs();
  applyLanguage();
};
$('#filter').oninput = side;
$('#editor').oninput = e => {
  lineEndings =
    e.target.value === baseline
      ? [...baselineEndings]
      : editLineEndings(source, e.target.value, lineEndings, newline);
  source = e.target.value;
  findCycling = false;
  update();
  scheduleRender();
  if ($('#findbar').classList.contains('open') && $('#query').value && sourceFind()) runFind(false);
};
$('#editor').addEventListener('mousedown', () => {
  findCycling = false;
});
// Markdown-aware keys in the source view. Composition keys from input methods are left alone.
$('#editor').addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;
  const ed = e.target,
    plainKey = !e.altKey && !e.metaKey && !e.ctrlKey;
  if (e.key === 'Enter' && plainKey) {
    const p = findHits[findIndex];
    if (
      findCycling &&
      $('#findbar').classList.contains('open') &&
      p !== undefined &&
      ed.selectionStart === p &&
      ed.selectionEnd === p + $('#query').value.length
    ) {
      e.preventDefault();
      nextMatch(e.shiftKey ? -1 : 1);
      return;
    }
    if (!e.shiftKey && ed.selectionStart === ed.selectionEnd) {
      const c = continueList(ed.value, ed.selectionStart);
      if (c) {
        e.preventDefault();
        applyEdit(c);
      }
    }
    return;
  }
  if (e.key === 'Tab' && plainKey) {
    e.preventDefault();
    applyEdit(indentLines(ed.value, ed.selectionStart, ed.selectionEnd, e.shiftKey));
  }
});
$('#find').onclick = () => toggleFind();
$('#close-find').onclick = () => toggleFind(false);
$('#query').oninput = () => runFind();
$('#prev-match').onclick = () => nextMatch(-1);
$('#next-match').onclick = () => nextMatch(1);
$('#query').onkeydown = e => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    nextMatch(e.shiftKey ? -1 : 1);
  }
};
$('#replace-one').onclick = replaceCurrent;
$('#replace-all').onclick = replaceEvery;
$('#replacement').onkeydown = e => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    replaceCurrent();
  }
};
$('#zoom').onclick = () => $('#zoom').classList.remove('open');
$('#check-isolation').onclick = async () => {
  if (isolationBusy) return;
  isolationBusy = true;
  const control = $('#check-isolation'),
    target = $('#isolation-result');
  control.disabled = true;
  target.textContent = t('about.checking');
  try {
    const before = await call('AboutInfo');
    const result = await previewFrame.inspect();
    const first = await call('AboutInfo');
    await new Promise(resolve => setTimeout(resolve, 500));
    const after = await call('AboutInfo');
    if (result.cancelled) throw new Error(t('about.isoRetry'));
    const extra = after.calls - before.calls - 2;
    if (
      !result.parentAccessDenied ||
      (result.nativeProbeAttempted && (first.calls - before.calls !== 1 || extra !== 0)) ||
      (!result.nativeProbeAttempted && result.goVisible)
    )
      throw new Error(t('about.isoFail'));
    target.textContent = result.nativeProbeAttempted
      ? t('about.isoPass', { n: extra })
      : t('about.isoPartial');
  } catch (e) {
    target.textContent = localizeMessage(e.message || e);
  } finally {
    isolationBusy = false;
    control.disabled = false;
  }
};
async function showAbout() {
  try {
    const [info, texts] = await Promise.all([call('AboutInfo'), call('LicenseTexts')]);
    licenseTexts = texts;
    $('#open-timing').textContent = JSON.stringify(info.openTiming, null, 2);
    $('#build-details').replaceChildren();
    for (const [label, value] of [
      ['about.version', info.version],
      ['about.platform', info.platform],
      ['about.built', info.builtAt],
      ['about.commit', info.commit],
      ['about.runtime', info.goVersion + ' · Wails ' + info.wailsVersion],
    ]) {
      const dt = document.createElement('dt'),
        dd = document.createElement('dd');
      dt.textContent = t(label);
      dd.textContent = value;
      $('#build-details').append(dt, dd);
    }
    $('#license-text').value = texts.own;
    aboutDialog
      .querySelectorAll('[data-license]')
      .forEach(b => b.classList.toggle('active', b.dataset.license === 'own'));
    toggleSettings(false);
    aboutDialog.showModal();
  } catch (e) {
    toast(e, true);
  }
}
function showShortcuts() {
  toggleSettings(false);
  $('#shortcuts-dialog').showModal();
}
async function exportHTML() {
  try {
    const p = await call('ExportHTML', current.name, await snapshot());
    if (p) toast(t('toast.exported'));
  } catch (e) {
    toast(e, true);
  }
}
async function printDocument() {
  try {
    await snapshot();
    printHost.replaceChildren();
    const s = document.createElement('style');
    s.textContent =
      '@media print{' + rendered.css.replace(/@page\s*\{[^}]*\}/g, '@page{margin:0;size:auto}') + '}';
    const b = document.createElement('article');
    b.innerHTML =
      activeTheme() === 'dark' && hasDiagram()
        ? (
            await renderDocument(source, {
              id: current.id,
              readImage: (...args) => call('ReadImage', ...args),
              theme: 'light',
            })
          ).body
        : rendered.body;
    b.querySelectorAll('details').forEach(d => {
      const section = document.createElement('section');
      section.className = 'print-details';
      while (d.firstChild) section.append(d.firstChild);
      d.replaceWith(section);
    });
    printHost.append(s, b);
    await Promise.allSettled([...printHost.querySelectorAll('img')].map(i => i.decode()));
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await call('Print');
  } catch (e) {
    toast(e, true);
  }
}
const actions = {
  open: () => $('#open').click(),
  folder: () => $('#folder').click(),
  new: () => $('#new').click(),
  save: () => save(false),
  'save-as': () => save(true),
  export: exportHTML,
  print: printDocument,
  about: showAbout,
  shortcuts: showShortcuts,
  sample: loadSample,
  settings: () => toggleSettings(),
  'font-bigger': () => setFontSize(prefs.size + 1),
  'font-smaller': () => setFontSize(prefs.size - 1),
  'font-reset': () => setFontSize(16),
  sidebar: () => $('#toggle-side').click(),
  focus: () => $('#focus').click(),
  find: () => toggleFind(),
  replace: () => toggleFind(true, true),
  read: () => setMode('read'),
  source: () => setMode('source'),
  split: () => setMode('split'),
  bold: () => formatSource('bold'),
  italic: () => formatSource('italic'),
  code: () => formatSource('code'),
  link: () => formatSource('link'),
  indent: () => formatSource('indent'),
  outdent: () => formatSource('outdent'),
};
const shortcutActions = {
  o: 'open',
  s: 'save',
  'save-as': 'save-as',
  n: 'new',
  f: 'find',
  p: 'print',
  ',': 'settings',
  1: 'read',
  2: 'source',
  3: 'split',
  b: 'bold',
  i: 'italic',
  e: 'code',
  k: 'link',
  ']': 'indent',
  '[': 'outdent',
  '/': 'shortcuts',
  replace: 'replace',
};
// A menu accelerator and the in-page shortcut can both fire for one key press; run each action once.
function runAction(name) {
  if (closeApproved || !actions[name]) return;
  const now = Date.now();
  if (lastAction.name === name && now - lastAction.at < 400) return;
  lastAction = { name, at: now };
  actions[name]();
}
function handleShortcut(k) {
  if (closeApproved) return;
  if (k === 'escape') {
    toggleFocus(false);
    toggleSettings(false);
    $('#zoom').classList.remove('open');
    toggleFind(false);
    return;
  }
  runAction(shortcutActions[k]);
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    handleShortcut('escape');
    return;
  }
  if (!(e.metaKey || e.ctrlKey) || e.isComposing) return;
  const k = e.key.toLowerCase();
  let name = '';
  if (e.altKey && e.code === 'KeyF') name = 'replace';
  else if (!isMac && k === 'h' && !e.altKey) name = 'replace';
  else if (k === 's' && e.shiftKey) name = 'save-as';
  else if (!e.altKey && !e.shiftKey && k in shortcutActions && k !== 'save-as' && k !== 'replace') name = k;
  if (name) {
    e.preventDefault();
    handleShortcut(name);
  }
});
function hasDiagram() {
  return /^\s*(```|~~~)\s*mermaid/m.test(source);
}
// Another program may change the open file. A clean document reloads in place; an edited one keeps its text and is warned once.
async function checkExternal() {
  if (!current.id || opening || saveBusy || !native()) return;
  const id = current.id,
    hash = current.hash;
  let now;
  try {
    now = await call('DocumentHash', id);
  } catch {
    if (current.id === id && externalNotice !== id + ':missing') {
      externalNotice = id + ':missing';
      toast(t('toast.missing'), true);
    }
    return;
  }
  if (current.id !== id || current.hash !== hash || now === hash) return;
  if (!dirty()) {
    enqueue(() =>
      documentTransition({
        guard: async () => current.id === id && current.hash === hash && !dirty(),
        load: () => call('ReadDocument', id),
        valid: () => current.id === id,
        apply: d => {
          useDocument(d, true);
          toast(t('toast.reloaded'));
        },
        setOpening,
      }),
    );
    return;
  }
  if (externalNotice !== id + ':' + now) {
    externalNotice = id + ':' + now;
    toast(t('toast.externalDirty'), true);
  }
}
addEventListener('focus', checkExternal);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkExternal();
});
setInterval(() => {
  if (!document.hidden && document.hasFocus()) checkExternal();
}, 4000);
// Reading position from the preview drives the outline highlight and, in split view, the editor.
function handlePosition({ ratio, heading, section, progress }) {
  if (heading !== currentHeading) {
    currentHeading = heading;
    for (const row of document.querySelectorAll('.outline-row')) {
      const on = row.dataset.id === heading;
      row.classList.toggle('active', on);
      if (on) {
        row.setAttribute('aria-current', 'location');
        row.scrollIntoView({ block: 'nearest' });
      } else row.removeAttribute('aria-current');
    }
  }
  if (mode !== 'split' || (scrollLead === 'editor' && Date.now() - scrollLeadAt < 250)) return;
  scrollLead = 'preview';
  scrollLeadAt = Date.now();
  const ed = $('#editor'),
    max = ed.scrollHeight - ed.clientHeight,
    tops = editorTops();
  ed.scrollTop = tops && section < tops.length ? place(tops, section, progress, max) : ratio * max;
}
let editorScrollQueued = false;
$('#editor').addEventListener(
  'scroll',
  () => {
    if (
      mode !== 'split' ||
      (scrollLead === 'preview' && Date.now() - scrollLeadAt < 250) ||
      editorScrollQueued
    )
      return;
    editorScrollQueued = true;
    requestAnimationFrame(() => {
      editorScrollQueued = false;
      scrollLead = 'editor';
      scrollLeadAt = Date.now();
      const ed = $('#editor'),
        max = ed.scrollHeight - ed.clientHeight,
        y = Math.min(ed.scrollTop, max),
        tops = editorTops();
      if (tops) {
        const at = locate(tops, y, max);
        previewFrame.scrollTo(at.progress, at.section).catch(() => {});
      } else previewFrame.scrollTo(max > 0 ? y / max : 0).catch(() => {});
    });
  },
  { passive: true },
);
// Split view aligns both panes by heading; these mirror the preview-side helpers in frame-bootstrap.js.
const span = (tops, k, max) => [k < 0 ? 0 : tops[k], Math.min(k + 1 < tops.length ? tops[k + 1] : max, max)];
const locate = (tops, y, max) => {
  let k = -1;
  while (k + 1 < tops.length && tops[k + 1] <= y) k++;
  const [a, b] = span(tops, k, max);
  return { section: k, progress: b > a ? Math.min(1, Math.max(0, (y - a) / (b - a))) : 0 };
};
const place = (tops, k, p, max) => {
  const [a, b] = span(tops, k, max);
  return a + Math.max(0, b - a) * p;
};
function sourceHeadingLines(lines) {
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
function caretTop(pos) {
  const ed = $('#editor');
  if (source.length > 2e6) {
    const lh = parseFloat(getComputedStyle(ed).lineHeight) || 25;
    return (source.slice(0, pos).split('\n').length - 1) * lh;
  }
  const m = mirrorOf(ed),
    mark = document.createElement('span');
  m.append(source.slice(0, pos), mark);
  document.body.append(m);
  const top = mark.offsetTop;
  m.remove();
  return top;
}
let mirrorKey = '',
  mirrorTops = null;
// Pixel tops of each heading line in the textarea.
function editorTops() {
  const ed = $('#editor');
  if (!rendered || source.length > 2e6) return null;
  const cs = getComputedStyle(ed),
    key = rendered.version + ':' + source.length + ':' + ed.clientWidth + ':' + cs.fontSize;
  if (key === mirrorKey) return mirrorTops;
  mirrorKey = key;
  mirrorTops = null;
  const lines = source.split('\n'),
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
  mirrorTops = marks.map(s => s.offsetTop);
  m.remove();
  return mirrorTops;
}
const splitter = $('#splitter');
function setSplit(v) {
  prefs.split = Math.min(80, Math.max(20, Math.round(v)));
  $('.view-area').style.setProperty('--split', prefs.split + '%');
}
splitter.onpointerdown = e => {
  e.preventDefault();
  splitter.setPointerCapture(e.pointerId);
  document.body.classList.add('resizing');
};
splitter.onpointermove = e => {
  if (!splitter.hasPointerCapture(e.pointerId)) return;
  const r = $('.view-area').getBoundingClientRect();
  setSplit(((e.clientX - r.left) / r.width) * 100);
};
splitter.onpointerup = splitter.onpointercancel = e => {
  if (splitter.hasPointerCapture(e.pointerId)) splitter.releasePointerCapture(e.pointerId);
  document.body.classList.remove('resizing');
  applyPrefs();
};
splitter.ondblclick = () => {
  setSplit(50);
  applyPrefs();
};
splitter.onkeydown = e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    setSplit(prefs.split + (e.key === 'ArrowLeft' ? -5 : 5));
    applyPrefs();
  }
};
window.addEventListener('error', e => toast(e.message, true));
window.addEventListener('unhandledrejection', e => toast(e.reason, true));
const previewFrame = createFrame($('#preview'), {
  onAction: previewAction,
  onPosition: handlePosition,
  onShortcut: handleShortcut,
  onError: message => toast(message, true),
  onDrop: (files, x, y) => {
    if (window.runtime?.CanResolveFilePaths?.()) {
      const rect = $('#preview').getBoundingClientRect();
      window.runtime.ResolveFilePaths(Math.round(x + rect.x), Math.round(y + rect.y), files);
    }
  },
});
$('#editor').value = source;
relabel();
applyPrefs();
if (window.runtime?.EventsOn) {
  call('SetLanguage', language()).catch(() => {});
  window.runtime.OnFileDrop?.(() => {}, false);
  window.runtime.EventsOn('menu', name => runAction(name));
  window.runtime.EventsOn('close-request', () => {
    if (closeInFlight) return;
    closeInFlight = true;
    enqueue(async () => {
      try {
        if (await guard()) {
          closeApproved = true;
          document.body.inert = true;
          $('#editor').disabled = true;
          await call('Quit');
        } else await call('CancelClose');
      } catch (e) {
        closeApproved = false;
        document.body.inert = false;
        $('#editor').disabled = false;
        await call('CancelClose');
        toast(e, true);
      } finally {
        closeInFlight = false;
      }
    });
  });
  initializeDocuments({
    runtime: window.runtime,
    ready: () => call('FrontendReady'),
    enqueue,
    addResult,
    ensureRendered: () => {
      if (version_ === 0) scheduleRender(0);
    },
    onError: e => toast(e, true),
  });
} else scheduleRender(0);
