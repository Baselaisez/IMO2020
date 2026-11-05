// after-save.js — "Kaydet ✓"ten sonra hangi ekran açılır?
//
// İSTEK: "Yeni hastanın ve ödemenin kaydı bitince uygulama bizi hemen ana
// sayfaya götürsün." Muayenehane akışı şöyle: hasta gelir → kaydı girilir →
// ödemesi girilir → bitti → SIRADAKİ HASTA. Her kaydın sonunda hasta kartında
// kalmak, doktoru her seferinde bir kez daha geri tuşuna bastırıyordu.
//
// KURAL (tek cümle):
//   YENİ bir kayıt tamamlandıysa ana sayfaya dön; MEVCUT bir kaydı
//   düzenlediysen bulunduğun yerde kal.
//
// YENİ HASTADA ARADA BİR ADIM VAR (doktorun isteği): hasta kaydedilince
// doğrudan ana sayfaya gidilmez, önce ÖDEME EKRANI açılır. Muayenehane akışı
// "hasta gelir → kaydı girilir → ödemesi alınır → sıradaki". Ödeme kaydedilse
// de vazgeçilse de akış ana sayfada biter. Yani varış noktası yine 'home';
// değişen, oraya giderken ödeme panelinden geçilmesi
// (bkz. ui-card.openCardThenPayment).
//
// İkinci yarısı neden böyle: doktor hasta kartından ✏️ ile bir alanı
// düzelttiğinde ya da yanlış girilmiş bir ödemeyi düzelttiğinde ana sayfaya
// fırlatılmak, "bitirdim" değil "kaybettim" hissi verir — baktığı kartı
// yeniden bulması gerekir. Düzenleme, akışın sonu değil ortasıdır.
//
// Saf tutuluyor ki kural tek yerde dursun ve testi olsun: ui-form.js (hasta)
// ile ui-card.js (ödeme) aynı kararı iki ayrı yerde farklı yorumlayamasın.

/**
 * @param {boolean} isNew Kayıt YENİ mi oluşturuldu (true), yoksa mevcut bir
 *   kayıt mı güncellendi (false)?
 * @returns {'home'|'stay'} 'home' → ana listeye dön. 'stay' → hasta kartında kal.
 */
export function afterSaveDestination(isNew) {
  return isNew ? 'home' : 'stay';
}
