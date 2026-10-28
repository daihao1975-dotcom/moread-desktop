import test from 'node:test';
import assert from 'node:assert/strict';
import { readRelativeDocument } from '../src/relative-link.js';

test('relative links retain decoded fragments while native authorization sees the original URL', async () => {
  for (const [href, anchor] of [
    ['other.md#%E7%AB%A0%E8%8A%82', '章节'],
    ['a%23b.md#heading', 'heading'],
    ['other.md', ''],
  ]) {
    const calls = [];
    const result = await readRelativeDocument('current', href, async (...args) => {
      calls.push(args);
      return args[0] === 'OpenRelative' ? { id: 'next' } : { id: 'next', content: '# Heading' };
    });
    assert.deepEqual(calls, [
      ['OpenRelative', 'current', href],
      ['ReadDocument', 'next'],
    ]);
    assert.equal(result.document.navigationAnchor, anchor);
  }
});

test('stale actions stop before reading and invalid fragments do not open documents', async () => {
  const calls = [];
  assert.equal(
    await readRelativeDocument(
      'current',
      'a.md#b',
      async (...args) => {
        calls.push(args);
        return { id: 'next' };
      },
      () => false,
    ),
    null,
  );
  assert.equal(calls.length, 1);
  await assert.rejects(
    readRelativeDocument('current', 'a.md#%ZZ', () => {
      assert.fail('invalid fragment must not open a file');
    }),
    URIError,
  );
});
