// Sesli yazma (dikte) yardımcısı — masaüstü (Mac / Windows) için.
//
// MAC VE iPHONE İÇİN NE DEĞİŞTİ
// • iPhone/iPad: iOS klavyesinin KENDİ 🎤 tuşu her metin kutusunda zaten var.
//   Uygulamanın ayrıca bir mikrofon düğmesi koyması gereksiz tekrar olurdu —
//   bu yüzden Android'de olduğu gibi iOS'ta da düğmeler gizlenir (attachVoice
//   erken döner). Kullanıcı klavyedeki mikrofona basar.
// • Mac: masaüstü klavyesinde böyle bir tuş yok; macOS diktesi bir kısayolla
//   (varsayılan: Fn tuşuna iki kez basmak) ya da Düzen ▸ Dikteyi Başlat ile
//   açılır. Bu yüzden Mac'te düğme GÖSTERİLİR ve doğru kutuyu odaklayıp
//   kısayolu hatırlatır — tıpkı Windows'taki Win + H akışı gibi.
//   Uygulama HİÇBİR platformda kendisi ses kaydetmez.
//
// NEDEN TARAYICI TANIMA MOTORU KULLANMIYORUZ
// Chromium'un Web Speech API'si (webkitSpeechRecognition) bu Electron sürümünde
// mevcut ama ÇALIŞMIYOR: nesne oluşuyor, start() mikrofonu gerçekten açıyor
// (audiostart/soundstart/speechstart olayları geliyor), ardından her seferinde
// `onerror → error: 'network'` gelip oturum kapanıyor; hiçbir sonuç dönmüyor.
// Electron, Google'ın konuşma servisi anahtarı olmadan derlendiği için beklenen
// davranış budur (Electron 33.4.11 / Chromium 130.0.6723.191 üzerinde iki kez
// doğrulandı).
//
// Ayrıca çalışsaydı bile KULLANAMAZDIK: o API sesi Google'ın sunucularına
// gönderir. Bu uygulama psikiyatri hasta verisi tutar — ses hiçbir buluta
// çıkamaz (KVKK). Chromium 130'da cihaz-üstü tanıma API'si de yok
// (SpeechRecognition.available / processLocally: her ikisi de tanımsız).
//
// Bu yüzden Windows'un KENDİ dikte özelliğini (Win + H) kullanıyoruz.
// Buradaki 🎤 düğmesi kayıt YAPMAZ — sadece (a) doğru alanı odaklar ki dikte
// metni doğru yere düşsün, (b) kısayolu ve gizlilik uyarısını hatırlatır.
//
// !!! GİZLİLİK — DİKKAT !!!
// Win + H ("sesli yazma") CİHAZ ÜSTÜNDE ÇALIŞMAZ. Microsoft'un kendi belgesi
// açıkça şöyle diyor: "Voice typing uses online speech recognition, powered by
// Azure Speech services." Yani ses, çözümlenmek üzere Microsoft sunucularına
// gider. Bu yüzden kullanıcıya "sesiniz internete gönderilmez" DEMİYORUZ —
// tersine, kimlik bilgisi dikte etmemesi için açıkça uyarıyoruz.
//
// Cihaz üstünde çalışan tek Windows seçeneği "Voice access"tir (dil paketi bir
// kez indirildikten sonra çevrimdışı çalışır), ancak desteklediği ~11 yerel
// ayar arasında TÜRKÇE YOKTUR — yani Türkçe not için kullanılamaz.
// Özetle: bugün Windows'ta Türkçe + cihaz-üstü dikte seçeneği yok. Karar
// doktorundur; bizim işimiz bunu gizlememek.

import { state, banner } from './ui.js';
import { getMeta, setMeta } from './repo.js';
import { platform, isDesktop } from './platform.js';

// Bu ipucunun bir daha gösterilmeyeceğini tutan meta anahtarı.
export const VOICE_HINT_KEY = 'voice_hint';

export const WIN_H_HINT = 'Sesli yazmak için imleç kutudayken klavyeden Win + H tuşlarına basın.';
export const MAC_DICTATION_HINT = 'Sesli yazmak için imleç kutudayken Fn tuşuna iki kez basın '
  + '(ya da menüden Düzen ▸ Dikteyi Başlat).';

// Bu uyarı bilerek kısa ve net: doktor hasta verisiyle ilgili bir kararı
// bilmeden vermesin. Ayrıntısı docs/SESLI-YAZMA.md içinde.
export const PRIVACY_WARNING = "DİKKAT: Windows'un sesli yazma özelliği sesinizi "
  + 'çözümlemek için Microsoft sunucularına gönderir; cihazda kalmaz. Hasta adı, '
  + 'telefon, adres gibi kimlik bilgilerini sesle yazdırmayın — onları elle yazın.';

// macOS diktesi bazı dillerde ve Apple Silicon Mac'lerde CİHAZ ÜSTÜNDE çalışır,
// bazılarında sesi Apple sunucularına gönderir. Apple, hangi dilin hangi Mac'te
// cihaz üstü işlendiğini kullanıcıya doğrudan göstermez; Türkçe için garanti
// veremeyiz. Bu yüzden "sesiniz cihazda kalır" DEMİYORUZ — Windows'takiyle aynı
// tutumla, kimlik bilgisi dikte edilmemesi konusunda uyarıyoruz.
export const MAC_PRIVACY_WARNING = 'DİKKAT: macOS diktesi bazı dil ve modellerde '
  + 'cihaz üstünde çalışır, bazılarında sesi çözümlemek için Apple sunucularına gönderir; '
  + 'Türkçe için bunu garanti edemeyiz. Hasta adı, telefon, adres gibi kimlik '
  + 'bilgilerini sesle yazdırmayın — onları elle yazın.';

/** Platforma göre ipucu + uyarı metni. Saf. */
export function dictationCopy(p = platform()) {
  return p === 'macos'
    ? { hint: MAC_DICTATION_HINT, warning: MAC_PRIVACY_WARNING, shortcut: 'Fn Fn', banner: '🎤 Fn tuşuna iki kez basıp konuşun — kimlik bilgisi dikte etmeyin.' }
    : { hint: WIN_H_HINT, warning: PRIVACY_WARNING, shortcut: 'Win + H', banner: '🎤 Win + H ile konuşun — kimlik bilgisi dikte etmeyin.' };
}

export { isDesktop };

// Meta değerinden ipucunun gösterilip gösterilmeyeceği. Saf.
// Sadece açıkça 'off' yazılmışsa gizlenir; null/bozuk değer → göster.
export function shouldShowHint(metaValue) {
  return metaValue !== 'off';
}

// Dikte başlamadan önce alanın içeriğini hazırla. Saf.
// Win + H metni imlecin bulunduğu yere yazar; imleci sona alıyoruz. Alanda
// zaten metin varsa ve sonu boşlukla bitmiyorsa bir ayırıcı ekliyoruz —
// aksi halde dikte edilen ilk kelime son kelimeye yapışır ("kaygıHasta...").
// Çok satırlı alanda (Notlar) ayırıcı yeni satır, tek satırlıkta boşluktur.
export function prepareForDictation(value, multiline = false) {
  const v = String(value ?? '');
  // Boş ya da sadece boşluktan oluşuyorsa dokunma: baştan ayırıcı eklemek
  // kaydedilen metnin başında istenmeyen boşluk bırakır.
  if (v.trim() === '') return { value: v, caret: v.length };
  if (/\s$/.test(v)) return { value: v, caret: v.length };
  const next = v + (multiline ? '\n' : ' ');
  return { value: next, caret: next.length };
}

function focusForDictation(el) {
  if (!el) return;
  const multiline = el.tagName === 'TEXTAREA';
  const { value, caret } = prepareForDictation(el.value, multiline);
  if (value !== el.value) el.value = value;
  el.focus();
  try { el.setSelectionRange(caret, caret); } catch { /* type=date vb. seçim desteklemez */ }
}

// "Bir daha gösterme" tercihini yaz. Asla patlamaz: bu bir kolaylık ayarıdır,
// başarısız olması dikteyi engellememeli.
async function suppressHint() {
  try { await setMeta(state.exec, VOICE_HINT_KEY, 'off'); }
  catch (e) { console.error('voice hint meta', e); }
}

async function hintSuppressed() {
  try { return !shouldShowHint(await getMeta(state.exec, VOICE_HINT_KEY)); }
  catch (e) { console.error('voice hint meta', e); return false; }
}

// İpucu KENDİ kaplamasını kurar, ui.js'in paylaşılan #sheet'ini kullanmaz:
// 🎤 düğmesi bir sheet'in İÇİNDE de olabiliyor (ödeme sayfasındaki Açıklama),
// oraya openSheet ile yazmak açık olan ödeme formunu silerdi.
// z-index 60 → #sheet-overlay'in (50) üstünde kalır.
function hintSheet(onDone) {
  const copy = dictationCopy();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.style.zIndex = '60';
  ov.innerHTML = `
    <div class="sheet">
      <h4>🎤 Sesli Yazma</h4>
      <p class="muted" style="line-height:1.6">${copy.hint}
        Bu pencereyi kapatınca imleç doğru kutuya gelecek; <b>${copy.shortcut}</b> ile konuşmaya başlayın,
        bitirince aynı kısayolla kapatın. Noktalama için &quot;nokta&quot;,
        &quot;virgül&quot;, &quot;yeni satır&quot; diyebilirsiniz.</p>
      <p style="line-height:1.6;color:var(--red);font-weight:600">${copy.warning}</p>
      <div class="form" style="padding:0">
        <button id="voice-ok" type="button" class="primary">Anladım</button>
        <button id="voice-never" type="button" class="ghost">Bir daha gösterme</button>
      </div>
    </div>`;
  const dismiss = () => { ov.remove(); onDone(); };
  ov.addEventListener('click', e => { if (e.target === ov) dismiss(); });
  ov.querySelector('#voice-ok').addEventListener('click', dismiss);
  ov.querySelector('#voice-never').addEventListener('click', async () => {
    await suppressHint();
    dismiss();
  });
  document.body.appendChild(ov);
}

// 🎤 düğmesine basıldığında: hedef alanı odakla, gerekiyorsa Win + H ipucunu
// göster. Kayıt yapmaz, sahte bir kayıt arayüzü göstermez.
async function onMicClick(target) {
  if (await hintSuppressed()) {
    focusForDictation(target);
    // İpucu kapatılmış olsa bile gizlilik hatırlatması kısa da olsa kalsın.
    banner(dictationCopy().banner, 'ok');
    return;
  }
  // Sayfa/sheet odağı çaldığı için alanı ipucu kapandıktan SONRA odaklıyoruz.
  hintSheet(() => focusForDictation(target));
}

// `root` içindeki [data-voice-for] düğmelerini bağlar ve masaüstündeysek
// gövdeye .is-desktop sınıfını ekler (CSS düğmeleri sadece o sınıfla gösterir,
// böylece iPhone ve Android'de klavyenin kendi mikrofonu tek başına kalır).
// Aynı kök için iki kez çağrılırsa düğmeler tekrar bağlanmaz.
export function attachVoice(root = document) {
  if (!isDesktop()) return;
  document.body.classList.add('is-desktop');
  for (const btn of root.querySelectorAll('[data-voice-for]')) {
    if (btn.dataset.voiceBound === '1') continue;
    btn.dataset.voiceBound = '1';
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.voiceFor);
      if (!target) return;
      onMicClick(target);
    });
  }
}
