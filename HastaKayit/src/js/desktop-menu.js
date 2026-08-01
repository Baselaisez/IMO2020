// Mac menü çubuğu → uygulama eylemleri.
//
// Menü öğeleri ekrandaki düğmelerin AYNISINI çalıştırır; ikinci bir kod yolu
// açmıyoruz. Bu yüzden dışa aktarma gibi adımlar ilgili ekranı açıp o ekranın
// kendi düğmesini tetikler: davranış (onay soruları, hata banner'ları, ilerleme
// göstergesi) tek yerde kalır.
import { desktop } from './desktop.js';
import { isDesktop } from './platform.js';
import { showScreen, banner } from './ui.js';
import { openForm } from './ui-form.js';
import { openSettings } from './ui-settings.js';
import { lockNow } from './lock.js';

async function inSettings(buttonId) {
  await openSettings();
  showScreen('settings');
  const btn = document.getElementById(buttonId);
  if (btn) btn.click();
}

export function initDesktopMenu() {
  if (!isDesktop()) return;

  const commands = {
    'new-patient': () => openForm(null),
    settings: async () => { await openSettings(); showScreen('settings'); },
    'export-xlsx': () => inSettings('btn-export-xlsx'),
    'backup-json': () => inSettings('btn-export-json'),
    import: () => inSettings('btn-import'),
    lock: () => lockNow(),
  };

  desktop.onMenu(cmd => {
    const fn = commands[cmd];
    if (!fn) return;
    // Kilit ekranındayken menüden veri açtırmak kilidi anlamsız kılardı.
    if (document.getElementById('screen-lock')?.classList.contains('hidden') === false && cmd !== 'lock') {
      banner('Önce PIN ile açın.', 'error', 2500);
      return;
    }
    Promise.resolve(fn()).catch(e => banner(`İşlem başarısız — ${e.message || e}`, 'error', 0));
  });

  const reveal = document.getElementById('btn-reveal-data');
  if (reveal) reveal.addEventListener('click', () => desktop.revealDataDir());
}
