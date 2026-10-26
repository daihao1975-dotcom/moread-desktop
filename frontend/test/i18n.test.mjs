import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LANGUAGES, matchLanguage, normalizeLanguage, setLanguage, t, localizeMessage } from '../src/i18n.js';
const dir = new URL('../src/locales/', import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const en = load('en.json');
const placeholders = s =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map(m => m[1])
    .sort()
    .join();
test('every bundled language has exactly the English keys, placeholders and no empty text', () => {
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort();
  assert.deepEqual(files.map(f => f.replace('.json', '')).sort(), LANGUAGES.map(([tag]) => tag).sort());
  for (const f of files) {
    const table = load(f);
    assert.deepEqual(Object.keys(table), Object.keys(en), f);
    for (const [k, v] of Object.entries(table)) {
      assert.ok(typeof v === 'string' && v.trim(), f + ' ' + k);
      assert.equal(placeholders(v), placeholders(en[k]), f + ' ' + k);
    }
  }
});
test('translated text never carries markup that could reach the page unescaped', () => {
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json')))
    for (const [k, v] of Object.entries(load(f)))
      assert.doesNotMatch(v, /<[a-z!/]|javascript:/i, f + ' ' + k);
});
test('every key used by the interface exists', () => {
  const src = new URL('../src/', import.meta.url);
  const used = new Set();
  for (const f of readdirSync(src).filter(f => f.endsWith('.js')))
    for (const m of readFileSync(new URL(f, src), 'utf8').matchAll(
      /\bt\('([\w.]+)'|data-i18n(?:-\w+)?="([\w.]+)/g,
    ))
      used.add(m[1] || m[2]);
  for (const m of readFileSync(new URL('../../menu.go', import.meta.url), 'utf8').matchAll(
    /tr\("([\w.]+)"\)/g,
  ))
    used.add(m[1]);
  for (const key of used) if (!key.endsWith('.')) assert.ok(key in en, key);
  assert.ok(used.size > 150);
});
test('system languages map onto the bundled set and fall back to English', () => {
  assert.equal(matchLanguage(['zh-Hans-CN', 'en-CN']), 'zh-CN');
  assert.equal(matchLanguage(['zh-Hant-TW']), 'zh-TW');
  assert.equal(matchLanguage(['zh-HK']), 'zh-TW');
  assert.equal(matchLanguage(['pt-PT']), 'pt-BR');
  assert.equal(matchLanguage(['de-AT']), 'de');
  assert.equal(matchLanguage(['ar-SA', 'fr-CA']), 'fr');
  assert.equal(matchLanguage(['ar-SA']), 'en');
  assert.equal(normalizeLanguage(''), '');
});
test('native error codes are shown in the interface language', () => {
  try {
    setLanguage('de');
    assert.equal(localizeMessage('Error: moread:tooLarge'), 'Die Datei überschreitet die Größenbeschränkung');
    assert.equal(localizeMessage('a.md: moread:notFound'), 'a.md: Die Datei existiert nicht');
    assert.match(localizeMessage('moread:exportFailed|disk full'), /disk full$/);
    assert.equal(localizeMessage('moread:unknownCode'), 'moread:unknownCode');
    assert.equal(t('find.position', { i: 2, n: 5 }), '2 von 5');
  } finally {
    setLanguage('zh-CN');
  }
});
