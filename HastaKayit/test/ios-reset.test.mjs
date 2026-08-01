// Package.resolved okuyucusu. Doğrulama adımının tamamı buna dayanıyor: yanlış
// okursa betik "8.5.0 çözümlendi" deyip kullanıcıyı yine hatalı derlemeye
// gönderir. Xcode'un üç biçimi de sınanıyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvedVersion, REQUIRED_CAPACITOR } from '../scripts/ios-reset-packages.mjs';

const V3 = JSON.stringify({
  originHash: 'abc',
  pins: [
    { identity: 'capacitor-swift-pm', kind: 'remoteSourceControl',
      location: 'https://github.com/ionic-team/capacitor-swift-pm.git',
      state: { revision: '4f71d0b', version: '8.5.0' } },
    { identity: 'zipfoundation', state: { version: '0.9.20' } },
  ],
  version: 3,
});

const V1 = JSON.stringify({
  object: { pins: [
    { package: 'Capacitor', repositoryURL: 'https://github.com/ionic-team/capacitor-swift-pm.git',
      state: { revision: '5962590', version: '8.0.0' } },
  ] },
  version: 1,
});

test('resolvedVersion: v3 biçimi', () => {
  assert.equal(resolvedVersion(V3, 'capacitor-swift-pm'), '8.5.0');
  assert.equal(resolvedVersion(V3, 'zipfoundation'), '0.9.20');
});

test('resolvedVersion: v1 biçiminde ad "Capacitor", kimlik değil — URL üzerinden bulunur', () => {
  assert.equal(resolvedVersion(V1, 'capacitor-swift-pm'), '8.0.0');
});

test('resolvedVersion: eksik/bozuk girdide sessizce null', () => {
  assert.equal(resolvedVersion('{bozuk', 'capacitor-swift-pm'), null);
  assert.equal(resolvedVersion('{}', 'capacitor-swift-pm'), null);
  assert.equal(resolvedVersion(JSON.stringify({ pins: [] }), 'capacitor-swift-pm'), null);
});

test('yanlış sürüm doğru sürümle karıştırılmaz', () => {
  assert.notEqual(resolvedVersion(V1, 'capacitor-swift-pm'), REQUIRED_CAPACITOR);
  assert.equal(resolvedVersion(V3, 'capacitor-swift-pm'), REQUIRED_CAPACITOR);
});

test('resolvedVersion: workspace-state.json biçimi (xcodebuild çıktısı)', () => {
  const WS = JSON.stringify({
    object: { dependencies: [
      { packageRef: { identity: 'capacitor-swift-pm', name: 'capacitor-swift-pm',
                      location: 'https://github.com/ionic-team/capacitor-swift-pm.git' },
        state: { checkoutState: { version: '8.5.0', revision: '4f71d0b' }, name: 'checkout' } },
    ] },
    version: 6,
  });
  assert.equal(resolvedVersion(WS, 'capacitor-swift-pm'), '8.5.0');
});

test('resolvedVersion: başka paketle karıştırmaz', () => {
  const WS = JSON.stringify({
    object: { dependencies: [
      { packageRef: { identity: 'zipfoundation' }, state: { checkoutState: { version: '0.9.20' } } },
    ] },
  });
  assert.equal(resolvedVersion(WS, 'capacitor-swift-pm'), null);
});
