import UIKit
import WebKit

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
  private var webView: WKWebView!
  private let origin: URL = {
    let raw = Bundle.main.object(forInfoDictionaryKey: "TAHTWebOrigin") as? String ?? ""
    if let url = URL(string: raw), let scheme = url.scheme, scheme == "https" {
      return url
    }
    return URL(string: "https://invalid.tahticihan.local")!
  }()

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 12 / 255, green: 10 / 255, blue: 8 / 255, alpha: 1)

    let originString = Bundle.main.object(forInfoDictionaryKey: "TAHTWebOrigin") as? String ?? ""
    if originString.isEmpty {
      showGate("Saltanat kapısı henüz bağlanmadı. Yayıncı TAHTWebOrigin adresini Info.plist içine yazmalıdır.")
      return
    }

    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = []
    config.defaultWebpagePreferences.allowsContentJavaScript = true
    config.applicationNameForUserAgent = "TahtiCihanNative/1.0"
    StoreBridge.install(on: config)
    NativeBridge.install(on: config)

    let webView = WKWebView(frame: view.bounds, configuration: config)
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.allowsBackForwardNavigationGestures = true
    webView.isOpaque = false
    webView.backgroundColor = view.backgroundColor
    view.addSubview(webView)
    self.webView = webView

    var request = URLRequest(url: origin)
    request.cachePolicy = .reloadIgnoringLocalCacheData
    webView.load(request)
    NativeBridge.shared.attach(webView)
  }

  private func showGate(_ message: String) {
    let label = UILabel()
    label.text = message
    label.textColor = UIColor(red: 232 / 255, green: 220 / 255, blue: 196 / 255, alpha: 1)
    label.font = UIFont.systemFont(ofSize: 17, weight: .regular)
    label.numberOfLines = 0
    label.textAlignment = .center
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
      label.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
    ])
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.cancel)
      return
    }
    if url.host == origin.host || url.scheme == "about" || url.scheme == "blob" {
      decisionHandler(.allow)
      return
    }
    if url.scheme == "http" || url.scheme == "https" {
      UIApplication.shared.open(url)
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.cancel)
  }
}
