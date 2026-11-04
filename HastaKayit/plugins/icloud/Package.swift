// swift-tools-version: 5.9
import PackageDescription

// Paket adı ELLE SEÇİLMEDİ: Capacitor CLI, npm paket adından (@hastakayit/icloud)
// türettiği adı hem `.package(name:)` hem `.product(name:)` için kullanır
// (bkz. @capacitor/cli → plugin.js `fixName`). Kural: "/" ve "-" alt çizgiye
// döner, "@" silinir, alt çizgiden sonraki harf büyür, ilk harf büyür:
//
//     @hastakayit/icloud  →  hastakayit_icloud  →  HastakayitIcloud
//
// Bu dosyadaki `name` ve library `name` o çıktıyla AYNI olmak zorundadır; aksi
// hâlde ios/App/CapApp-SPM/Package.swift çözümlenemez ve Xcode "missing
// package product" hatası verir.
let package = Package(
    name: "HastakayitIcloud",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "HastakayitIcloud",
            targets: ["ICloudSyncPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "ICloudSyncPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/ICloudSyncPlugin")
    ]
)
