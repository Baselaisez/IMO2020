// Hata özetleyici. Amacı 38 satırlık gürültüyü kaç FARKLI sebep olduğuna
// indirmek; yanlış gruplarsa teşhis yine kaybolur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeErrors } from '../scripts/ios-build.mjs';

const LOG = `
CompileSwift normal arm64 /Users/x/SceneDelegate.swift
/Users/x/SceneDelegate.swift:14:9: error: cannot find 'SceneDelegateProxy' in scope
/Users/x/SceneDelegate.swift:18:9: error: cannot find 'SceneDelegateProxy' in scope
/Users/y/Other.swift:3:1: error: no such module 'Capacitor'
warning: something harmless
** BUILD FAILED **
`;

test('aynı mesaj farklı satırlardan gelse de tek grupta toplanır', () => {
  const out = summarizeErrors(LOG);
  assert.equal(out.length, 2);
  assert.equal(out[0].count, 2);
  assert.match(out[0].message, /SceneDelegateProxy/);
});

test('en çok tekrarlayan hata başa gelir', () => {
  const out = summarizeErrors(LOG);
  assert.ok(out[0].count >= out[1].count);
});

test('uyarılar hata sayılmaz', () => {
  assert.ok(summarizeErrors(LOG).every(e => !/harmless/.test(e.message)));
});

test('hatasız günlükte boş liste', () => {
  assert.deepEqual(summarizeErrors('** BUILD SUCCEEDED **\nwarning: x'), []);
  assert.deepEqual(summarizeErrors(''), []);
});
