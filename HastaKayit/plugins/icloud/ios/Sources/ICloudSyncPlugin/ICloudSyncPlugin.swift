import Foundation
import Capacitor

/// iCloud Drive üzerinden cihazlar arası eşitleme — dosya katmanı.
///
/// NEDEN AYRI BİR YERLİ EKLENTİ
/// Capacitor'ın Filesystem eklentisi yalnızca uygulamanın KENDİ kabındaki
/// klasörleri (Documents, Library, Cache…) görebilir. O klasörler iCloud'a
/// kopyalanmaz; iPhone'daki `Documents/HastaKayit/sync` klasörünü Mac asla
/// göremez. iCloud ile paylaşılan tek yer, uygulamanın "ubiquity container"ıdır
/// ve ona yalnızca `FileManager.url(forUbiquityContainerIdentifier:)` ile
/// erişilir. Bu eklenti sadece onu açar.
///
/// Mac tarafında aynı klasör, normal bir dosya yolu olarak görünür:
///     ~/Library/Mobile Documents/iCloud~com~hastakayit~app/Documents
/// Bu yüzden Electron tarafına yerli kod gerekmez (bkz. electron/icloud.cjs).
///
/// GÜVENLİK: Köprüden gelen dosya adı SABİT bir listeye karşı doğrulanır.
/// Ele geçirilmiş bir WebView bile bu eklentiyle iCloud'daki başka bir dosyayı
/// okuyamaz veya silemez.
///
/// İŞ PARÇACIĞI: `url(forUbiquityContainerIdentifier:)` BLOKLAYICIDIR ve Apple
/// belgelerine göre ana iş parçacığında çağrılmamalıdır (ilk çağrıda saniyeler
/// sürebilir). Bu yüzden her köprü çağrısı `queue` üzerinde çalışır.
@objc(ICloudSyncPlugin)
public class ICloudSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ICloudSyncPlugin"
    public let jsName = "ICloudSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rename", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    /// Info.plist'teki NSUbiquitousContainers ve App.entitlements ile AYNI olmalı.
    private static let containerIdentifier = "iCloud.com.hastakayit.app"

    /// sync-file.js'in kullandığı iki ad. Başka hiçbir ada izin yok.
    private static let allowedNames: Set<String> = [
        "hastakayit-sync.json",
        "hastakayit-sync.json.tmp"
    ]

    /// Karşı cihazın yazdığı dosya bu cihaza inerken beklenecek en uzun süre.
    private static let downloadTimeout: TimeInterval = 20
    private static let downloadPollInterval: TimeInterval = 0.25

    private let queue = DispatchQueue(label: "com.hastakayit.icloud", qos: .userInitiated)

    private enum ICloudError: LocalizedError {
        case unavailable
        case badName(String)

        var errorDescription: String? {
            switch self {
            case .unavailable:
                return "iCloud Drive kullanılamıyor. Ayarlar → (adınız) → iCloud → iCloud Drive açık olmalı."
            case .badName(let name):
                return "Eşitleme dosyası değil: \(name)"
            }
        }
    }

    // MARK: - Ortak yardımcılar

    /// Ubiquity container'ın Documents klasörü (yoksa oluşturulur).
    /// Documents ALT KLASÖRÜ şart: NSUbiquitousContainerIsDocumentScopePublic
    /// yalnızca orayı Dosyalar/Finder'da görünür kılar.
    private func documentsURL() throws -> URL {
        let fm = FileManager.default
        guard let container = fm.url(forUbiquityContainerIdentifier: ICloudSyncPlugin.containerIdentifier) else {
            throw ICloudError.unavailable
        }
        let docs = container.appendingPathComponent("Documents", isDirectory: true)
        if !fm.fileExists(atPath: docs.path) {
            try fm.createDirectory(at: docs, withIntermediateDirectories: true)
        }
        return docs
    }

    private func fileURL(_ name: String?) throws -> URL {
        guard let n = name, ICloudSyncPlugin.allowedNames.contains(n) else {
            throw ICloudError.badName(name ?? "(boş)")
        }
        return try documentsURL().appendingPathComponent(n, isDirectory: false)
    }

    /// Her köprü çağrısının ortak kabuğu: arka planda çalıştır, hatayı JS'e
    /// okunabilir bir mesaj olarak ilet. Eşitleme hatası uygulamayı DÜŞÜRMEZ;
    /// JS tarafı bunu "eşitleme yapılamadı" uyarısına çevirir.
    private func run(_ call: CAPPluginCall, _ body: @escaping () throws -> [String: Any]) {
        queue.async {
            do {
                call.resolve(try body())
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Karşı cihazın yazdığı dosya henüz inmemişse iCloud yalnızca gizli bir
    /// yer tutucu bırakır: ".hastakayit-sync.json.icloud". Gerçek dosya o anda
    /// YOKTUR ve okuma boş döner — eşitleme de "karşı cihazda kayıt yok"
    /// sanardı. Bu yüzden önce indirme tetiklenir ve beklenir.
    private func ensureDownloaded(_ url: URL) -> Bool {
        let fm = FileManager.default
        if fm.fileExists(atPath: url.path) {
            // Dosya var ama BAYAT olabilir (karşı cihaz yeni sürüm yazmış).
            // İndirmeyi tetiklemek sürümü tazeler; beklemeye gerek yok.
            try? fm.startDownloadingUbiquitousItem(at: url)
            return true
        }
        // Yer tutucu da yoksa dosya GERÇEKTEN yok (ilk eşitleme). Boşuna
        // beklememek için hemen dön — aksi hâlde her ilk açılış 20 sn donardı.
        guard placeholderExists(url) else { return false }
        try? fm.startDownloadingUbiquitousItem(at: url)
        let deadline = Date().addingTimeInterval(ICloudSyncPlugin.downloadTimeout)
        while Date() < deadline {
            if fm.fileExists(atPath: url.path) { return true }
            Thread.sleep(forTimeInterval: ICloudSyncPlugin.downloadPollInterval)
        }
        return fm.fileExists(atPath: url.path)
    }

    private func placeholderExists(_ url: URL) -> Bool {
        let holder = url.deletingLastPathComponent()
            .appendingPathComponent("." + url.lastPathComponent + ".icloud")
        return FileManager.default.fileExists(atPath: holder.path)
    }

    // MARK: - Köprü yöntemleri

    /// iCloud bu cihazda kullanılabilir mi? JS tarafı buna bakarak eşitlemeyi
    /// iCloud'a mı yoksa yerel klasöre mi yapacağına karar verir.
    @objc func status(_ call: CAPPluginCall) {
        run(call) {
            let fm = FileManager.default
            guard fm.ubiquityIdentityToken != nil else {
                return [
                    "available": false,
                    "reason": "Bu iPhone'da iCloud hesabı açık değil. Ayarlar → (adınız) → iCloud."
                ]
            }
            guard let container = fm.url(forUbiquityContainerIdentifier: ICloudSyncPlugin.containerIdentifier) else {
                return [
                    "available": false,
                    "reason": "iCloud Drive kapalı. Ayarlar → (adınız) → iCloud → iCloud Drive."
                ]
            }
            let docs = container.appendingPathComponent("Documents", isDirectory: true)
            try? fm.createDirectory(at: docs, withIntermediateDirectories: true)
            return ["available": true, "path": docs.path]
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        let name = call.getString("name")
        run(call) { [weak self] in
            guard let self = self else { return ["data": NSNull()] }
            let url = try self.fileURL(name)
            guard self.ensureDownloaded(url) else { return ["data": NSNull()] }

            var text: String?
            var readFailed = false
            var coordError: NSError?
            NSFileCoordinator(filePresenter: nil)
                .coordinate(readingItemAt: url, options: [.withoutChanges], error: &coordError) { readURL in
                    do { text = try String(contentsOf: readURL, encoding: .utf8) }
                    catch { readFailed = true }
                }
            if let err = coordError { throw err }
            // Okunamadı = dosya yok sayılır. sync-file.js bunu "karşı cihaz
            // henüz yazmamış" olarak ele alır ve YEREL VERİYE DOKUNMAZ.
            // `text ?? NSNull()` YAZILAMAZ: Swift'te `??`'nin iki tarafı aynı
            // türde olmalı, String? ile NSNull birleşmez ve derleme kırılır.
            if readFailed { return ["data": NSNull()] }
            if let t = text { return ["data": t] }
            return ["data": NSNull()]
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        let name = call.getString("name")
        let data = call.getString("data") ?? ""
        run(call) { [weak self] in
            guard let self = self else { return [:] }
            let url = try self.fileURL(name)
            var writeError: Error?
            var coordError: NSError?
            NSFileCoordinator(filePresenter: nil)
                .coordinate(writingItemAt: url, options: [.forReplacing], error: &coordError) { writeURL in
                    do { try data.write(to: writeURL, atomically: true, encoding: .utf8) }
                    catch { writeError = error }
                }
            if let err = coordError { throw err }
            if let err = writeError { throw err }
            return ["ok": true, "bytes": data.utf8.count]
        }
    }

    /// .tmp → son ad. sync-file.js'in atomik yazması buna dayanır: karşı cihaz
    /// asla yarım yazılmış bir dosya okumaz.
    @objc func rename(_ call: CAPPluginCall) {
        let from = call.getString("from")
        let to = call.getString("to")
        run(call) { [weak self] in
            guard let self = self else { return [:] }
            let src = try self.fileURL(from)
            let dst = try self.fileURL(to)
            var moveError: Error?
            var coordError: NSError?
            NSFileCoordinator(filePresenter: nil).coordinate(
                writingItemAt: src, options: [.forMoving],
                writingItemAt: dst, options: [.forReplacing],
                error: &coordError
            ) { srcURL, dstURL in
                let fm = FileManager.default
                do {
                    if fm.fileExists(atPath: dstURL.path) { try fm.removeItem(at: dstURL) }
                    try fm.moveItem(at: srcURL, to: dstURL)
                } catch {
                    moveError = error
                }
            }
            if let err = coordError { throw err }
            if let err = moveError { throw err }
            return ["ok": true]
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        let name = call.getString("name")
        run(call) { [weak self] in
            guard let self = self else { return [:] }
            let url = try self.fileURL(name)
            var coordError: NSError?
            NSFileCoordinator(filePresenter: nil)
                .coordinate(writingItemAt: url, options: [.forDeleting], error: &coordError) { deleteURL in
                    try? FileManager.default.removeItem(at: deleteURL)
                }
            if let err = coordError { throw err }
            return ["ok": true]
        }
    }
}
