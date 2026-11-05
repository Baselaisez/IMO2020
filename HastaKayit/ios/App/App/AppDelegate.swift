import UIKit
import Capacitor

// @UIApplicationMain DEĞİL: Swift 5.3'ten beri kullanımdan kalktı ve Swift 6'da
// HATA olacak (Xcode 27 bunu uyarı olarak gösteriyor). `@main` aynı işi yapar,
// iOS 14+ ister — bu projenin hedefi zaten iOS 15.
@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // UIScene yaşam döngüsü: hangi sahne yapılandırmasının kullanılacağını
    // söyler. Adı Info.plist'teki UISceneConfigurationName ile AYNI olmalı.
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration",
                                    sessionRole: connectingSceneSession.role)
    }

}

/// UIScene yaşam döngüsü — iOS 27 SDK ile ZORUNLU.
///
/// NEDEN EKLENDİ (gerçek çökme)
/// Xcode 27 ile derleyip telefona kurunca uygulama açılır açılmaz çöküyordu:
///
///     Application failed to launch: UIScene life cycle is required for apps
///     built with this SDK.
///
/// Eski (yalnızca AppDelegate'li) yapı, yeni SDK'larla derlenen uygulamalarda
/// artık kabul edilmiyor. Capacitor 8 hazır bir SceneDelegate getirmiyor, bu
/// yüzden burada tanımlı.
///
/// AYRI DOSYA DEĞİL, BİLEREK: yeni bir .swift dosyası Xcode proje dosyasına
/// (project.pbxproj) elle eklenmek zorunda kalırdı; o dosyayı elle düzenlemek
/// kırılgandır. AppDelegate.swift zaten projede olduğu için sınıfı buraya
/// koymak aynı sonucu risksiz veriyor.
///
/// Pencereyi KURMUYORUZ: Info.plist'teki UISceneStoryboardFile sayesinde UIKit
/// Main.storyboard'u (içinde CAPBridgeViewController var) kendisi yükler ve
/// pencereyi buradaki `window` özelliğine yazar.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    // Sahne yaşam döngüsünde açılış URL'leri ve universal link'ler artık
    // AppDelegate'e DEĞİL buraya düşüyor. Capacitor'ın eklentileri (paylaşım,
    // takvim, dosya açma) bu bildirimlere bağlı olduğu için aynı proxy'ye
    // iletiyoruz — aksi hâlde sessizce çalışmazlardı.
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        if let url = connectionOptions.urlContexts.first?.url {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
        }
        for activity in connectionOptions.userActivities {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared,
                                                            continue: activity,
                                                            restorationHandler: { _ in })
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared,
                                                        continue: userActivity,
                                                        restorationHandler: { _ in })
    }
}
