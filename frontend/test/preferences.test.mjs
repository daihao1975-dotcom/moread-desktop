import test from 'node:test';
import assert from 'node:assert/strict';
import { readPreferences, widthCSS, sourceWidthCSS } from '../src/preferences.js';
test('legacy default width migrates to fluid without changing typography', () => {
  const p = readPreferences({ width: 860, size: 19, theme: 'dark', sidebar: false });
  assert.equal(p.width, 'auto');
  assert.equal(p.size, 19);
  assert.equal(p.theme, 'dark');
  assert.equal(p.sidebar, false);
});
test('intentional fixed width choices survive migration and restart', () => {
  for (const w of [720, 1040]) assert.equal(readPreferences({ width: w }).width, w);
  const p = readPreferences({ layoutVersion: 2, width: 860, size: 17 });
  assert.equal(readPreferences(JSON.parse(JSON.stringify(p))).width, 860);
  assert.equal(readPreferences({ layoutVersion: 2, width: 'auto' }).width, 'auto');
});
test('width CSS accepts only fluid or bounded fixed widths', () => {
  assert.equal(widthCSS('auto'), 'none');
  assert.equal(widthCSS(860), '860px');
  for (const w of ['NaN', 'undefined', '100%;color:red', null, Infinity]) assert.equal(widthCSS(w), 'none');
});
test('source view centres the fixed reading measure and keeps the pane when fluid', () => {
  assert.equal(sourceWidthCSS('auto'), '100%');
  assert.equal(sourceWidthCSS('720'), '720px');
  assert.equal(sourceWidthCSS(1040), '1040px');
  for (const w of ['NaN', '100%;color:red', null, 500]) assert.equal(sourceWidthCSS(w), '100%');
});
test('reading typeface defaults to sans and keeps only known faces', () => {
  assert.equal(readPreferences({}).font, 'sans');
  assert.equal(readPreferences({ font: 'serif' }).font, 'serif');
  for (const f of ['Comic Sans', 'serif;color:red', null, 1])
    assert.equal(readPreferences({ font: f }).font, 'sans');
});
test('split ratio is kept only within the draggable range', () => {
  assert.equal(readPreferences({}).split, 50);
  assert.equal(readPreferences({ split: 35 }).split, 35);
  for (const v of [10, 95, '40', 40.5, null]) assert.equal(readPreferences({ split: v }).split, 50);
});
test('pane order and left pane width survive restart together', () => {
  assert.equal(readPreferences({}).previewOnLeft, false);
  const saved = readPreferences({ previewOnLeft: true, split: 70 });
  const restored = readPreferences(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.previewOnLeft, true);
  assert.equal(restored.split, 70);
  assert.equal(readPreferences({ previewOnLeft: 'true' }).previewOnLeft, false);
});
test('theme follows the system by default and resolves to a concrete reading theme', async () => {
  const { resolveTheme } = await import('../src/preferences.js');
  assert.equal(readPreferences({}).theme, 'auto');
  assert.equal(readPreferences({ theme: 'paper' }).theme, 'paper');
  assert.equal(readPreferences({ theme: 'neon' }).theme, 'auto');
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('paper', true), 'paper');
});
test('interface language is kept only as auto or a language tag', () => {
  assert.equal(readPreferences({}).lang, 'auto');
  assert.equal(readPreferences({ lang: 'ja' }).lang, 'ja');
  assert.equal(readPreferences({ lang: 'pt-BR' }).lang, 'en');
  assert.equal(readPreferences({ lang: 'zh-TW' }).lang, 'zh-TW');
  for (const v of ['<b>', 'zh_cn', 1, null]) assert.equal(readPreferences({ lang: v }).lang, 'auto');
});
test('the printed table of contents is off unless chosen', () => {
  assert.equal(readPreferences({}).printToc, false);
  assert.equal(readPreferences({ printToc: true }).printToc, true);
  assert.equal(readPreferences({ printToc: 'yes' }).printToc, false);
});
