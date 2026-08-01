// Xcode'un takılı kalmış Swift Package çözümlemesini sıfırlar.
//
// NEDEN GEREKLİ
// ios/App/CapApp-SPM/Package.swift, Capacitor'ı `exact: "8.5.0"` ile ister.
// Buna rağmen Xcode bir kez ESKİ bir sürümü çözümlemişse (örneğin projenin
// ilk açılışında ağ hatası olmuş ya da başka bir Capacitor sürümüyle
// çözümlenmişse) o pini kendiliğinden bırakmaz ve derleme şu hatayı verir:
//
//     Cannot find 'SceneDelegateProxy' in scope     (SceneDelegate.swift)
//
// Sebep tam olarak budur: `SceneDelegateProxy` Capacitor 8.5.0'da VARDIR,
// 8.0.0'da YOKTUR (ikili çerçeveler indirilip doğrulandı). Yani kod doğru,
// Xcode yanlış sürümü derliyor. Bu betik pinleri ve bu projeye ait türetilmiş
// verileri siler; ardından Xcode Package.swift'in istediği sürümü çeker.
//
// Çalıştırma:  npm run ios:reset
import { rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Yalnızca BU projeye ait durum silinir. Kullanıcının diğer Xcode projelerini
// etkileyen genel önbelleğe (~/Library/Caches/org.swift.swiftpm) dokunulmaz;
// gerekirse komutu aşağıda yazıyoruz ki karar kullanıcının olsun.
const targets = [
  path.join(root, 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm'),
  path.join(root, 'ios/App/CapApp-SPM/.build'),
  path.join(root, 'ios/App/build'),
];

let removed = 0;
for (const t of targets) {
  if (!existsSync(t)) continue;
  await rm(t, { recursive: true, force: true });
  console.log(`  silindi: ${path.relative(root, t)}`);
  removed++;
}

// Bu projenin türetilmiş verisi (App-xxxxx). Diğer projelerinki korunur.
const dd = path.join(os.homedir(), 'Library/Developer/Xcode/DerivedData');
if (existsSync(dd)) {
  for (const name of await readdir(dd)) {
    if (!/^App-[a-z]+$/i.test(name)) continue;
    await rm(path.join(dd, name), { recursive: true, force: true });
    console.log(`  silindi: DerivedData/${name}`);
    removed++;
  }
}

console.log(removed ? '' : '  Silinecek bir şey yoktu.\n');
console.log(`  Sırada:
    1. npm run ios          (Xcode'u açar)
    2. Xcode ▸ File ▸ Packages ▸ Resolve Package Versions
    3. Sol paneldeki "capacitor-swift-pm" sürümünün 8.5.0 olduğunu doğrulayın
    4. ⇧⌘K (Clean Build Folder), sonra ⌘R

  Hâlâ 8.0.0 görünüyorsa Swift Package genel önbelleği de takılmış demektir;
  o zaman şunu çalıştırıp 1. adımdan devam edin:

      rm -rf ~/Library/Caches/org.swift.swiftpm
`);
