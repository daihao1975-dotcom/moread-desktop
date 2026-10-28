import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
// Each entry is [tag, name shown in its own language]. The same files drive the native menus.
export const LANGUAGES = [
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['en', 'English'],
  ['ja', '日本語'],
  ['ko', '한국어'],
];
const tables = { en, 'zh-CN': zhCN, 'zh-TW': zhTW, ja, ko };
let lang = 'en';
// Mirrors normalizeLanguage in i18n.go.
export function normalizeLanguage(tag) {
  const t = String(tag || '')
    .trim()
    .replace(/_/g, '-')
    .toLowerCase();
  if (!t) return '';
  if (t.startsWith('zh')) return /hant|-tw|-hk|-mo/.test(t) ? 'zh-TW' : 'zh-CN';
  const base = t.split('-')[0];
  return tables[base] ? base : '';
}
export function matchLanguage(list) {
  for (const tag of list || []) {
    const l = normalizeLanguage(tag);
    if (l) return l;
  }
  return 'en';
}
export function setLanguage(tag) {
  lang = tables[tag] ? tag : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  return lang;
}
export const language = () => lang;
export function t(key, vars) {
  let s = tables[lang][key] ?? en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}
export const hasKey = key => key in en;
// Native errors arrive as "moread:code" or "moread:code|detail".
export function localizeMessage(message) {
  return String(message ?? '')
    .replace(/^Error:\s*/, '')
    .replace(/moread:([A-Za-z0-9]+)(?:\|([^\n]*))?/g, (m, code, detail = '') =>
      hasKey('err.' + code) ? t('err.' + code, { detail }) : m,
    );
}
// Static markup carries data-i18n attributes so a language switch can relabel it in place.
export function translate(root) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  // Hints become data-tip for the app's own tooltip; only frames keep a title, which names them for assistive technology.
  for (const [attr, name] of [
    ['data-i18n-title', 'data-tip'],
    ['data-i18n-label', 'aria-label'],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-alt', 'alt'],
  ])
    for (const node of root.querySelectorAll('[' + attr + ']')) {
      const [key, hint] = node.getAttribute(attr).split('|');
      node.setAttribute(
        name === 'data-tip' && node.tagName === 'IFRAME' ? 'title' : name,
        t(key) + (hint ? ' (' + hint + ')' : ''),
      );
    }
}
