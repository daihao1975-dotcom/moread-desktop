export const normalizeWidth = value =>
  value === 'auto' ? 'auto' : [720, 860, 1040].includes(Number(value)) ? Number(value) : 'auto';
// Fluid width follows the window but stops at a comfortable reading measure.
export const FLUID_WIDTH = 'min(100%, 48em)';
export const widthCSS = value =>
  normalizeWidth(value) === 'auto' ? FLUID_WIDTH : normalizeWidth(value) + 'px';
export const THEMES = ['auto', 'light', 'paper', 'dark'];
// "auto" follows the system appearance; the reading pane only ever receives a concrete theme.
export const resolveTheme = (theme, systemDark) =>
  theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;
export function readPreferences(raw = {}) {
  const p = {
    layoutVersion: 2,
    theme: 'auto',
    size: 16,
    width: 'auto',
    sidebar: true,
    split: 50,
    lang: 'auto',
  };
  if (Number.isInteger(raw.split) && raw.split >= 20 && raw.split <= 80) p.split = raw.split;
  if (THEMES.includes(raw.theme)) p.theme = raw.theme;
  if (Number.isInteger(raw.size) && raw.size >= 13 && raw.size <= 24) p.size = raw.size;
  if (typeof raw.sidebar === 'boolean') p.sidebar = raw.sidebar;
  if (typeof raw.lang === 'string' && /^(auto|[a-z]{2}(-[A-Z]{2})?)$/.test(raw.lang)) p.lang = raw.lang;
  const w = normalizeWidth(raw.width);
  p.width = raw.layoutVersion === 2 ? w : w === 860 ? 'auto' : w;
  return p;
}
