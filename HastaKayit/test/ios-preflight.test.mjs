// Ön denetimin saf ayrıştırıcıları. Denetimin kendisi macOS gerektiriyor ama
// asıl kırılgan kısım bu üç ayrıştırma; yanlış sınıflandırma kullanıcıyı yanlış
// komuta yönlendirir (örn. Xcode kuruluyken "Xcode kurun" demek).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDeveloperDir, parseXcodeVersion, hasIosRuntime } from '../scripts/ios-preflight.mjs';

test('classifyDeveloperDir: Command Line Tools yolu Xcode sanılmaz', () => {
  assert.equal(classifyDeveloperDir('/Library/Developer/CommandLineTools\n'), 'clt');
  assert.equal(classifyDeveloperDir('/Applications/Xcode.app/Contents/Developer\n'), 'xcode');
  // Xcode-beta ve elle taşınmış kurulumlar da Xcode sayılır.
  assert.equal(classifyDeveloperDir('/Applications/Xcode-beta.app/Contents/Developer'), 'xcode');
  assert.equal(classifyDeveloperDir(''), 'missing');
  assert.equal(classifyDeveloperDir(undefined), 'missing');
});

test('parseXcodeVersion: sürüm satırını okur', () => {
  assert.deepEqual(parseXcodeVersion('Xcode 16.2\nBuild version 16C5032a'), { major: 16, minor: 2, text: '16.2' });
  // Ara sürüm numarası olmayan biçim de kabul edilir.
  assert.deepEqual(parseXcodeVersion('Xcode 15\nBuild version 15A240d'), { major: 15, minor: 0, text: '15.0' });
  // Lisans metni sürüm gibi okunmamalı.
  assert.equal(parseXcodeVersion('You have not agreed to the Xcode license agreements.'), null);
  assert.equal(parseXcodeVersion(''), null);
});

test('hasIosRuntime: yalnızca gerçek bir iOS çalışma zamanı sayılır', () => {
  assert.equal(hasIosRuntime('== Runtimes ==\niOS 18.2 (18.2 - 22C150) - com.apple.CoreSimulator.SimRuntime.iOS-18-2'), true);
  // Sadece watchOS/tvOS kuruluysa iPhone simülatörü yok demektir.
  assert.equal(hasIosRuntime('== Runtimes ==\nwatchOS 11.2 (...)\ntvOS 18.2 (...)'), false);
  assert.equal(hasIosRuntime(''), false);
});
