import UIKit
import WebKit
import UserNotifications
import AuthenticationServices

/// Push token, deep links, Sign in with Apple → JS `window.TahtNative`.
final class NativeBridge: NSObject, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
  private weak var webView: WKWebView?
  private var pushToken: String?
  private var pendingRoute: String?

  static let shared = NativeBridge()

  static func install(on config: WKWebViewConfiguration) {
    let bridge = NativeBridge.shared
    let user = config.userContentController
    user.add(bridge, name: "tahtPushRequest")
    user.add(bridge, name: "tahtAppleSignIn")
    let js = """
    window.TahtNative = Object.assign(window.TahtNative || {}, {
      platform: "ios",
      getPushToken: () => Promise.resolve(window.__tahtPushToken || null),
      requestPush: () => new Promise((resolve) => {
        window.__tahtPushResolve = resolve;
        window.webkit.messageHandlers.tahtPushRequest.postMessage("1");
      }),
      appleSignIn: () => new Promise((resolve, reject) => {
        window.__tahtAppleResolve = resolve;
        window.__tahtAppleReject = reject;
        window.webkit.messageHandlers.tahtAppleSignIn.postMessage("1");
      })
    });
    if (window.__tahtPendingRoute) {
      const r = window.__tahtPendingRoute;
      window.__tahtPendingRoute = null;
      history.replaceState(null, "", r);
    }
    """
    user.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    UNUserNotificationCenter.current().delegate = bridge
  }

  func attach(_ webView: WKWebView) {
    self.webView = webView
    if let route = pendingRoute {
      pendingRoute = nil
      openRoute(route)
    }
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    webView = message.webView
    if message.name == "tahtPushRequest" {
      requestPush()
    } else if message.name == "tahtAppleSignIn" {
      Task { @MainActor in await appleSignIn() }
    }
  }

  func handleIncomingURL(_ url: URL) {
    guard let route = Self.route(from: url) else { return }
    if webView == nil {
      pendingRoute = route
      return
    }
    openRoute(route)
  }

  func didRegisterPush(deviceToken: Data) {
    let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    pushToken = token
    eval("window.__tahtPushToken = '\(token)'; window.__tahtPushResolve && window.__tahtPushResolve('\(token)')")
  }

  func didFailPush(_ error: Error) {
    eval("window.__tahtPushResolve && window.__tahtPushResolve(null)")
  }

  private func requestPush() {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
      DispatchQueue.main.async {
        if granted {
          UIApplication.shared.registerForRemoteNotifications()
        } else {
          self.eval("window.__tahtPushResolve && window.__tahtPushResolve(null)")
        }
      }
    }
  }

  @MainActor
  private func appleSignIn() async {
    let provider = ASAuthorizationAppleIDProvider()
    let request = provider.createRequest()
    request.requestedScopes = [.fullName, .email]
    let controller = ASAuthorizationController(authorizationRequests: [request])
    let waiter = AppleWaiter()
    controller.delegate = waiter
    controller.presentationContextProvider = waiter
    controller.performRequests()
    if let token = await waiter.token() {
      eval("window.__tahtAppleResolve && window.__tahtAppleResolve('\(token)')")
    } else {
      eval("window.__tahtAppleReject && window.__tahtAppleReject(new Error('cancelled'))")
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    if let route = response.notification.request.content.userInfo["route"] as? String {
      openRoute(route)
    }
    completionHandler()
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .list])
  }

  private func openRoute(_ route: String) {
    let path = route.hasPrefix("/") ? route : "/\(route)"
    let originRaw = Bundle.main.object(forInfoDictionaryKey: "TAHTWebOrigin") as? String ?? ""
    guard let base = URL(string: originRaw), base.scheme == "https",
          var comps = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
      pendingRoute = path
      return
    }
    let parts = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
    let nextPath = parts.first ?? "/oyun"
    comps.path = nextPath.isEmpty ? "/oyun" : nextPath
    comps.query = parts.count > 1 && !parts[1].isEmpty ? parts[1] : nil
    guard let url = comps.url else { return }
    guard let webView else {
      pendingRoute = path
      return
    }
    webView.load(URLRequest(url: url))
  }

  private func eval(_ js: String) {
    DispatchQueue.main.async { self.webView?.evaluateJavaScript(js, completionHandler: nil) }
  }

  static func route(from url: URL) -> String? {
    if url.scheme == "tahticihan" {
      let path = url.host.map { "/\($0)" } ?? url.path
      let q = url.query.map { "?\($0)" } ?? ""
      let combined = path.hasPrefix("/") ? path + q : "/\(path)\(q)"
      return combined.isEmpty ? "/oyun" : combined
    }
    let configured = (Bundle.main.object(forInfoDictionaryKey: "TAHTWebOrigin") as? String).flatMap { URL(string: $0)?.host }
    if url.host == "tahticihan.app" || (configured != nil && url.host == configured) {
      return url.path + (url.query.map { "?\($0)" } ?? "")
    }
    return nil
  }
}

private final class AppleWaiter: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private var cont: CheckedContinuation<String?, Never>?

  func token() async -> String? {
    await withCheckedContinuation { self.cont = $0 }
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    let cred = authorization.credential as? ASAuthorizationAppleIDCredential
    let token = cred?.identityToken.flatMap { String(data: $0, encoding: .utf8) }
    cont?.resume(returning: token)
    cont = nil
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    cont?.resume(returning: nil)
    cont = nil
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
      ?? UIWindow()
  }
}
