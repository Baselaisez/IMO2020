// guncelle-core.mjs — guncelle.mjs'in SAF karar fonksiyonlari.
//
// Neden ayri dosya: guncelle.mjs ice aktarilir aktarilmaz `git pull`
// calistiriyor. Test edilebilmesi icin karar veren kisim, is yapan kisimdan
// ayrilmak zorunda. Burada hicbir yan etki yok: dosya okunmaz, komut
// calismaz — sadece verilen bilgiyle karar verilir.

/** Electron'un calistirilabilir dosyasinin `dist` icindeki yolu. */
export function electronAltYol(platform) {
  switch (platform) {
    case 'darwin': case 'mas': return 'Electron.app/Contents/MacOS/Electron';
    case 'win32': return 'electron.exe';
    default: return 'electron';
  }
}

/**
 * Electron kurulumu SAGLAM mi?
 *
 * Uc sart BIRDEN aranir, cunku doktorun Mac'inde hatanin kaynagi tam da
 * sartlardan yalnizca birinin saglanmasiydi: `dist` klasoru vardi ama
 * `path.txt` yoktu ve Electron "kurulum bozuk" deyip duruyordu. "Klasor var"
 * demek "kurulu" demek degildir.
 *
 * pathTxt: path.txt icerigi (dosya yoksa null)
 * altYol:  o platformda beklenen ic yol
 * ikiliVar: dist/<altYol> dosyasi gercekten var mi
 */
export function electronSaglam({ pathTxt, altYol, ikiliVar }) {
  if (pathTxt == null) return false;
  if (pathTxt.trim() !== altYol) return false;
  return ikiliVar === true;
}

/** Electron surum paketinin GitHub'daki dosya adi. */
export function electronZipAdi(surum, platform, arch) {
  const mimari = arch === 'arm64' ? 'arm64' : 'x64';
  return `electron-v${surum}-${platform}-${mimari}.zip`;
}
