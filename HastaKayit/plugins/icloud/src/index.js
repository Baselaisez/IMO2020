// Bu paketin VAROLMA SEBEBİ yerli (Swift) taraftır: Capacitor CLI, package.json
// içindeki "capacitor" anahtarını görünce ios/Sources altındaki Swift sınıfını
// bulur, ios/App/App/capacitor.config.json → packageClassList'e ekler ve
// ios/App/CapApp-SPM/Package.swift'e bağımlılık olarak yazar.
//
// Uygulama kodu bu dosyayı İÇE AKTARMAZ: src/js/icloud.js doğrudan
// `registerPlugin('ICloudSync')` çağırır. Böylece web paketi (esbuild) bu
// pakete hiç bağlı olmaz ve `npm install` çalıştırılmamış bir ağaçta bile
// `npm run build` kırılmaz. Burası yalnızca `main` alanının boşa düşmemesi ve
// paketi doğrudan kullanmak isteyen bir çağıran için durur.
import { registerPlugin } from '@capacitor/core';

export const ICloudSync = registerPlugin('ICloudSync');
export default ICloudSync;
