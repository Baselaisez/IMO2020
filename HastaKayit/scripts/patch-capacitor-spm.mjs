// Eklentilerin Capacitor'ı DAL'a (branch) sabitlemesini sürüm aralığına çevirir.
//
// SORUN
// @capacitor-community/sqlite (8.1.0 dahil, en güncel sürüm) Package.swift'inde
// Capacitor'ı şöyle ister:
//
//     .package(url: ".../capacitor-swift-pm.git", branch: "8.0.0")
//
// Diğer TÜM eklentiler `from: "8.0.0"` kullanır. Swift Package Manager'da bir
// DAL gereksinimi, sürüm gereksinimlerini ezer ve tüm çözümleme grafiğine
// dayatılır. Sonuç: uygulamamızın kendi Package.swift'i Capacitor'ı
// `exact: "8.5.0"` ile istese bile SPM "8.0.0" DALINI çeker.
//
// Bir DAL gereksinimi ile bir SÜRÜM gereksinimi aynı pakette çakışır: kök
// projemiz `exact: "8.0.0"` der, sqlite ise "8.0.0" DALINI ister. İkisi aynı
// koda işaret etse bile SPM için farklı türde gereksinimlerdir ve çözümleme
// öngörülemez hâle gelir (Xcode'un yan panelinde "capacitor-swift-pm 8.0.0"
// yazması bir sürüm etiketi değil, dal adıdır — teşhisi bu yüzden zordur).
//
// ÇÖZÜM
// `branch: "X"` → `from: "X"`. Böylece grafikteki tüm gereksinimler sürüm
// tabanlı olur ve kökteki `exact: "8.0.0"` net biçimde 8.0.0'ı seçtirir.
// Eklentinin kendi kodu değişmez.
//
// Bu bir node_modules yamasıdır: her `npm install` sonrası silinir, o yüzden
// postinstall olarak çalışır. Yukarı akış düzeltince (sqlite `from:` kullanınca)
// yama kendiliğinden no-op olur ve dosya bir daha değişmez.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Yamalanan eklentiler. Yeni bir eklenti aynı hatayı yaparsa buraya eklenir. */
export const PACKAGES = [
  '@capacitor-community/sqlite',
  '@aparajita/capacitor-biometric-auth',
  '@ebarooni/capacitor-calendar',
  '@capacitor/app',
  '@capacitor/filesystem',
  '@capacitor/local-notifications',
  '@capacitor/share',
];

/**
 * capacitor-swift-pm'e ait `branch:` gereksinimini `from:` yapar. Saf.
 * Yalnızca capacitor-swift-pm satırına dokunur — eklentinin diğer
 * bağımlılıkları (SQLCipher, ZIPFoundation) olduğu gibi kalır.
 */
export function patchBranchPin(source) {
  const re = /(capacitor-swift-pm\.git"\s*,\s*)branch(\s*:\s*")/g;
  const text = String(source).replace(re, '$1from$2');
  return { text, changed: text !== String(source) };
}

async function main() {
  const patched = [];
  for (const pkg of PACKAGES) {
    const file = path.join(root, 'node_modules', pkg, 'Package.swift');
    if (!existsSync(file)) continue;
    const src = await readFile(file, 'utf8');
    const { text, changed } = patchBranchPin(src);
    if (!changed) continue;
    await writeFile(file, text);
    patched.push(pkg);
  }
  if (patched.length) {
    console.log(`Capacitor SPM yaması: ${patched.join(', ')} → branch: yerine from:`);
    console.log('(neden: bkz. scripts/patch-capacitor-spm.mjs — SceneDelegateProxy hatası)');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
