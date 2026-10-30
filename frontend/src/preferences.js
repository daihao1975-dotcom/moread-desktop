export const normalizeWidth = value =>
  value === 'auto' ? 'auto' : [720, 860, 1040].includes(Number(value)) ? Number(value) : 'auto';
// Fluid width uses the available pane; fixed widths remain an explicit reading preference.
export const FLUID_WIDTH = 'none';
export const widthCSS = value =>
  normalizeWidth(value) === 'auto' ? FLUID_WIDTH : normalizeWidth(value) + 'px';
// The source view centres the same measure inside its pane; fluid keeps the whole pane.
export const sourceWidthCSS = value =>
  normalizeWidth(value) === 'auto' ? '100%' : normalizeWidth(value) + 'px';
export const THEMES = ['auto', 'light', 'paper', 'dark'];
export const FONTS = ['sans', 'serif'];
export const normalizeFont = value => (FONTS.includes(value) ? value : 'sans');
// "auto" follows the system appearance; the reading pane only ever receives a concrete theme.
export const resolveTheme = (theme, systemDark) =>
  theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;
export function readPreferences(raw = {}) {
  const p = {
    layoutVersion: 2,
    theme: 'auto',
    size: 16,
    width: 'auto',
    font: 'sans',
    sidebar: true,
    split: 50,
    previewOnLeft: false,
    lang: 'auto',
    printToc: false,
  };
  if (Number.isInteger(raw.split) && raw.split >= 20 && raw.split <= 80) p.split = raw.split;
  if (typeof raw.previewOnLeft === 'boolean') p.previewOnLeft = raw.previewOnLeft;
  if (THEMES.includes(raw.theme)) p.theme = raw.theme;
  if (Number.isInteger(raw.size) && raw.size >= 13 && raw.size <= 24) p.size = raw.size;
  p.font = normalizeFont(raw.font);
  if (typeof raw.sidebar === 'boolean') p.sidebar = raw.sidebar;
  if (typeof raw.printToc === 'boolean') p.printToc = raw.printToc;
  if (typeof raw.lang === 'string' && /^(auto|[a-z]{2}(-[A-Z]{2})?)$/.test(raw.lang))
    p.lang = ['auto', 'en', 'zh-CN', 'zh-TW', 'ja', 'ko'].includes(raw.lang) ? raw.lang : 'en';
  const w = normalizeWidth(raw.width);
  p.width = raw.layoutVersion === 2 ? w : w === 860 ? 'auto' : w;
  return p;
}
