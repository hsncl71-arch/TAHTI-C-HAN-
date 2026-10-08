import UIKit
import UserNotifications

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let window = UIWindow(frame: UIScreen.main.bounds)
    window.backgroundColor = UIColor(red: 12 / 255, green: 10 / 255, blue: 8 / 255, alpha: 1)
    window.rootViewController = WebViewController()
    window.makeKeyAndVisible()
    self.window = window
    if let url = launchOptions?[.url] as? URL {
      NativeBridge.shared.handleIncomingURL(url)
    }
    return true
  }

  func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    NativeBridge.shared.handleIncomingURL(url)
    return true
  }

  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    if userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL {
      NativeBridge.shared.handleIncomingURL(url)
      return true
    }
    return false
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NativeBridge.shared.didRegisterPush(deviceToken: deviceToken)
  }

  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NativeBridge.shared.didFailPush(error)
  }
}