// Keyboard shortcuts: the key-to-action table, key event matching and the reference shown in Help.
export const shortcutActions = {
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
// shortcutKey returns the shortcutActions key for a Cmd/Ctrl key press, or '' when it is not a shortcut.
export function shortcutKey(e, isMac) {
  if (!(e.metaKey || e.ctrlKey) || e.isComposing) return '';
  const k = e.key.toLowerCase();
  if (e.altKey && e.code === 'KeyF') return 'replace';
  if (!isMac && k === 'h' && !e.altKey) return 'replace';
  if (k === 's' && e.shiftKey) return 'save-as';
  if (!e.altKey && !e.shiftKey && k in shortcutActions && k !== 'save-as' && k !== 'replace') return k;
  return '';
}
export function renderShortcuts(list, isMac, t) {
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
