# Android (Samsung) APK derlemesi

Bu belge Android sürümünün **sıfırdan nasıl derlendiğini** anlatır. Amaç
tekrarlanabilirlik: aynı adımlar boş bir Linux makinede aynı APK'yı üretir.

Android platformu `npx cap add android` ile eklenmişti ama hiç derlenmemişti;
ilk derleme burada anlatılan adımlarla yapıldı.

Telefona kurma, eşitleme ve 5.9 → 5.10.0 geçişi için ayrıca:
[SAMSUNG-ESITLEME.md](SAMSUNG-ESITLEME.md).

## ⚠️ EN ÖNEMLİ KURAL: İMZA ANAHTARINI KAYBETME

Bundan sonraki **her** sürüm `android/hastakayit-release.jks` ile imzalanmalıdır.

> **Anahtar şu an depoda DEĞİL.** `android/.gitignore`, `*.jks` ve
> `keystore.properties`'i dışarıda tutuyor; çünkü `keystore.properties` imza
> parolasını düz metin tutar ve depoya giren bir imza anahtarı, depoyu
> okuyabilen herkesin bu uygulama adına sahte güncelleme imzalayabilmesi
> demektir. Anahtar dosyaları derlemeyi yapan oturumdan ayrıca teslim edildi;
> **güvenli bir yerde saklanması gerekir** (iCloud Drive'daki HastaKayit
> klasörü, parola yöneticisi, şifreli yedek).
>
> Anahtarı bilinçli olarak depoya koymak isteniyorsa — özel depo, elden tek
> kliniğe kurulum, kaybı hasta kaydı silinmesi demek — tek komut yeter:
>
> ```bash
> git add -f HastaKayit/android/hastakayit-release.jks \
>            HastaKayit/android/keystore.properties
> ```
>
> Bu bilinçli bir ödünleşmedir ve kararı depo sahibi verir.

Android, bir uygulamanın güncellenmesine ancak yeni APK **eskisiyle aynı
anahtarla** imzalanmışsa izin verir. Farklı bir anahtarla imzalarsan telefon
kurulumu `INSTALL_FAILED_UPDATE_INCOMPATIBLE` ile reddeder. O noktada tek çözüm
uygulamayı **kaldırmaktır** — ve kaldırma, telefondaki veritabanını da siler,
yani **hasta kayıtları gider**.

Bu yüzden:

- Anahtarı silme, değiştirme, yeniden üretme.
- Parolasını değiştirme (`android/keystore.properties` içinde yazılı).
- `assembleRelease` dışında bir yolla (örneğin `assembleDebug`) üretilmiş APK'yı
  telefona kurma: debug APK'lar Android'in genel debug anahtarıyla imzalanır,
  o da release anahtarından farklıdır.

### 5.10.0'da bir kez yaşanan kopuş

Telefonda kurulu olan eski sürüm (`HastaKayit-v5.9.apk`) 17 Temmuz 2026'da
üretilmiş, `CN=Hasta Kayit` sertifikalı **özel** bir anahtarla imzalanmıştı.
O anahtar ne depoda ne git geçmişinde; eski bir oturumda üretilip kaybolmuş ve
kurtarılamıyor.

Eski imzanın SHA-256'sı:
`3ef0d8a5f60adc10c432bb4370f13e2b5936527c0fc8209f450402d34fbdb1c8`

Anahtar kayıp olduğu için 5.10.0 zorunlu olarak **yeni** bir anahtarla
imzalandı. Sonuç: 5.10.0 eski sürümün üzerine kurulamaz, kullanıcı eski
uygulamayı bir kez kaldırmak zorundadır. Kaldırmadan önce **Ayarlar &
Yedekleme → yedek al** denmelidir, yoksa telefondaki kayıtlar kaybolur.

Bu, 5.10.0'a özgü tek seferlik bir kopuştur. 5.10.0'dan sonraki sürümler aynı
`hastakayit-release.jks` ile imzalandığı sürece normal güncelleme olarak kurulur.

## Gerekenler

| | Sürüm |
|---|---|
| Java (JDK) | 21 |
| Gradle | 8.14.3 (depodaki `gradlew` kendisi indirir) |
| Android Gradle Plugin | 8.13.0 (`android/build.gradle` içinde sabit) |
| Node | 22 |

`android/variables.gradle` şunları ister: `compileSdkVersion = 36`,
`targetSdkVersion = 36`, `minSdkVersion = 24`.

## Android SDK kurulumu

Android Studio gerekmez; komut satırı araçları yeter.

```bash
# 1) Komut satırı araçlarını indir ve SDK'nın beklediği yere yerleştir
mkdir -p /opt/android-sdk/cmdline-tools
cd /tmp
curl -LO https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
unzip -q commandlinetools-linux-13114758_latest.zip -d /tmp/clt
mv /tmp/clt/cmdline-tools /opt/android-sdk/cmdline-tools/latest

# 2) Ortam değişkenleri
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk

# 3) Lisansları kabul et (etkileşimsiz)
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses

# 4) Gereken paketler
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
    "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

Kurulan sürümler:

| Paket | Sürüm |
|---|---|
| `platforms;android-36` | r02 |
| `build-tools;36.0.0` | 36.0.0 |
| `platform-tools` | r37.0.1 |

`cmdline-tools/latest` yolu önemli: `sdkmanager` kendini bu konuma göre
konumlandırır, zip'i doğrudan `/opt/android-sdk` içine açmak çalışmaz.

## Derleme

```bash
cd HastaKayit
npm install
npm run build                     # esbuild → www/

export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
npx cap sync android              # www/ → android/app/src/main/assets/public

cd android
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleRelease
```

Çıktı: `android/app/build/outputs/apk/release/app-release.apk`
Depoya kopyalanan hâli: `dist-android/HastaKayit-5.10.0.apk`

`local.properties` depoya girmez (`android/.gitignore` içinde) — her makinede
bir kez yazılır.

## İmzalama nasıl kurulu

`android/app/build.gradle` parolaları **gömmez**; `android/keystore.properties`
dosyasından okur:

```properties
storeFile=hastakayit-release.jks
storePassword=hastakayit
keyAlias=hastakayit
keyPassword=hastakayit
```

`build.gradle` içindeki mantık: `keystore.properties` ve işaret ettiği `.jks`
dosyası varsa `signingConfigs.release` kurulur ve `release` yapılandırmasına
bağlanır; yoksa release derlemesi imzasız kalır ama **derleme yine çalışır**.
Böylece anahtarı olmayan bir çalışma kopyasında da proje derlenebilir.

Yeni bir makinede derlemek için iki dosyayı `android/` içine koymak yeterli:
`hastakayit-release.jks` ve yukarıdaki içerikle `keystore.properties`.
İkisi de depoda olmadığı için (bkz. en üstteki uyarı) elle yerleştirilir.

Anahtar şu komutla üretildi (bir daha üretme — bkz. yukarıdaki uyarı):

```bash
keytool -genkeypair -v -keystore android/hastakayit-release.jks \
  -alias hastakayit -keyalg RSA -keysize 4096 -validity 10950 \
  -storepass hastakayit -keypass hastakayit \
  -dname "CN=Hasta Kayit, O=Hasta Kayit, C=TR"
```

4096 bit RSA, 10950 gün (≈30 yıl) geçerli.

### İmzayı doğrulama

```bash
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs \
    dist-android/HastaKayit-5.10.0.apk
```

5.10.0 için çıktı:

```
Signer #1 certificate DN: CN=Hasta Kayit, O=Hasta Kayit, C=TR
Signer #1 certificate SHA-256 digest: 0dc9865de6eecc77187d1657f1ba3a1c736a5371f7b0c9c6532305c35d7549e5
Signer #1 certificate SHA-1   digest: 242450a6994aebf704eefa005eccd6083baf16d0
```

Sonraki sürümlerde bu SHA-256 **aynı kalmalıdır**. Değiştiyse yanlış anahtarla
imzalanmış demektir ve telefona kurulmaz.

## Sürüm numaraları

`versionName` elle iki yerde tutulmaz: `app/build.gradle`, kök
`package.json`'daki `version` alanını okur (`groovy.json.JsonSlurper`). Sürümü
yükseltmek için yalnızca `package.json` düzenlenir.

`versionCode` elle tutulur ve **her sürümde artmalıdır**; şu an `51000`
(5.10.0 ⇒ 5·10000 + 10·100 + 0). Android, versionCode'u düşen bir APK'yı
güncelleme olarak kabul etmez.

## Karşılaşılan sorunlar ve çözümleri

### 1. Maven Central 429 "Too Many Requests"

İlk iki derleme denemesi bağımlılık indirirken çöktü:

```
Could not GET 'https://repo.maven.apache.org/maven2/.../kotlin-stdlib-2.0.21.jar'.
Received status code 429 from server: Too Many Requests
```

Bu bir proje hatası değil: Maven Central, derlemenin yapıldığı çıkış IP'sine
hız sınırı uyguluyordu. `curl` ile aynı dosyayı istemek de 429 döndürdü, yani
Gradle'ın eşzamanlılığıyla ilgisi yoktu; `--max-workers=1` ve yineleme
(4 deneme) işe yaramadı.

Çözüm: Google'ın Maven Central aynası. Aynı artifact'leri aynı yollarla sunuyor
ve bu ortamdan erişilebiliyor:

```
https://maven-central.storage-download.googleapis.com/maven2
```

`mavenCentral()` tanımları bu aynaya yönlendirildi ve derleme 2 dk 21 sn'de
tamamlandı.

Bu yönlendirme **projeye değil, makineye** yazıldı — `~/.gradle/init.d/`
altındaki bir init betiği ile. Böylece depo temiz kaldı: Maven Central'a
normal erişimi olan bir makinede hiçbir fark olmaz. Aynı sorunu yaşayan başka
bir makinede `~/.gradle/init.d/maven-central-mirror.gradle` dosyasını şu
içerikle oluşturmak yeterli:

```groovy
def mirrorUrl = 'https://maven-central.storage-download.googleapis.com/maven2'
def centralHosts = ['repo.maven.apache.org', 'repo1.maven.org'] as Set

def retarget = { handler ->
    if (handler == null) return
    def doomed = handler.findAll { r ->
        (r instanceof org.gradle.api.artifacts.repositories.MavenArtifactRepository) &&
                centralHosts.contains(r.url?.host)
    }
    if (doomed.isEmpty()) return
    doomed.each { handler.remove(it) }
    handler.maven { repo ->
        repo.name = 'mavenCentralGcsMirror'
        repo.url = mirrorUrl
    }
}

gradle.settingsEvaluated { settings ->
    retarget(settings.pluginManagement.repositories)
    retarget(settings.buildscript.repositories)
}

gradle.projectsEvaluated { g ->
    g.rootProject.allprojects { p ->
        retarget(p.repositories)
        retarget(p.buildscript.repositories)
    }
}
```

### 2. Kotlin eklentisi sürüm uyarısı

```
The Kotlin Gradle plugin was loaded multiple times...
The Kotlin plugin was loaded in the following projects:
':capacitor-filesystem', ':ebarooni-capacitor-calendar'
```

Sadece **uyarı**. İki Capacitor eklentisi Kotlin eklentisini kendi
`build.gradle`'ında sürümüyle birlikte bildiriyor; bu dosyalar `node_modules`
altında ve her `npm install`'da üzerine yazılır, dolayısıyla düzeltmek kalıcı
olmaz. Derlemeyi engellemiyor, dokunulmadı.

### 3. `flatDir` uyarısı

```
WARNING: Using flatDir should be avoided...
```

Capacitor'ın ürettiği `capacitor-cordova-android-plugins` yapılandırmasından
geliyor. Üretilen dosya, elle düzeltilmez. Uyarı, zararsız.

### 4. `libsqlcipher.so` soyulamadı

```
Unable to strip the following libraries, packaging them as they are:
libsqlcipher.so
```

`@capacitor-community/sqlite` ile gelen hazır yerel kütüphane. Debug
simgeleri soyulamadığı için olduğu gibi paketlendi; APK bir miktar büyük
oluyor, işlevsel etkisi yok. Uyarı.

### 5. Kotlin tip uyarıları (eklenti kaynağı)

`@capacitor/filesystem` içindeki `LegacyFilesystemImplementation.kt` birkaç
"Java type mismatch" uyarısı veriyor. Yukarı akış eklentisinin kendi kodu,
`node_modules` altında; dokunulmadı. Derlemeyi engellemiyor.

## Dokunulmayanlar

- `src/`, `ios/`, `electron/`: uygulama mantığına hiç dokunulmadı.
- `AndroidManifest.xml`: izinler olduğu gibi bırakıldı. Özellikle
  **`MANAGE_EXTERNAL_STORAGE` kaldırılmamalıdır** — eşitleme dosyası
  Syncthing'in görebilmesi için herkese açık `Documents/HastaKayit/sync`
  klasörüne yazılır ve Android 11+ bunu bu izin olmadan engeller. İzni
  kaldırmak Samsung eşitlemesini **sessizce** bozar. Gerekçe manifest içindeki
  yorumda da duruyor.

## Telefona kurma

1. `dist-android/HastaKayit-5.10.0.apk`'yı telefona kopyala.
2. Dosya yöneticisinden aç, "bilinmeyen kaynaklara izin ver" sor­arsa onayla.
3. İlk açılışta **Ayarlar > Uygulamalar > Hasta Kayıt > İzinler > Tüm
   dosyalara erişim** iznini ver (eşitleme için şart).
4. Randevu hatırlatmaları için bildirim iznini onayla.

5.9'dan geçiş yapılıyorsa: önce 5.9'da yedek al, sonra 5.9'u kaldır, sonra
5.10.0'ı kur (bkz. "5.10.0'da bir kez yaşanan kopuş").
