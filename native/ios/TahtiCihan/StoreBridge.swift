import UIKit
import StoreKit
import WebKit

/// StoreKit 2 bridge. Never reports a successful purchase without a verified transaction.
final class StoreBridge: NSObject, WKScriptMessageHandler {
  private weak var webView: WKWebView?

  static func install(on config: WKWebViewConfiguration) {
    let bridge = StoreBridge()
    let user = config.userContentController
    user.add(bridge, name: "storekitPurchase")
    user.add(bridge, name: "storekitRestore")
    user.add(bridge, name: "storekitManage")
    let js = """
    window.TahtNative = Object.assign(window.TahtNative || {}, { platform: "ios" });
    window.StoreKit = {
      purchase: (id) => new Promise((resolve, reject) => {
        window.__tahtStoreResolve = resolve;
        window.__tahtStoreReject = reject;
        window.webkit.messageHandlers.storekitPurchase.postMessage(String(id || ""));
      }),
      restore: () => new Promise((resolve, reject) => {
        window.__tahtStoreResolve = resolve;
        window.__tahtStoreReject = reject;
        window.webkit.messageHandlers.storekitRestore.postMessage("1");
      }),
      manageSubscriptions: () => new Promise((resolve) => {
        window.__tahtStoreResolve = resolve;
        window.webkit.messageHandlers.storekitManage.postMessage("1");
      })
    };
    """
    user.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    objc_setAssociatedObject(config, "taht.store", bridge, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    webView = message.webView
    switch message.name {
    case "storekitPurchase":
      Task { await purchase(String(describing: message.body)) }
    case "storekitRestore":
      Task { await restore() }
    case "storekitManage":
      Task { await manage() }
    default:
      break
    }
  }

  @MainActor
  private func fail(_ code: String) {
    webView?.evaluateJavaScript("window.__tahtStoreReject && window.__tahtStoreReject(new Error('\(code)'))")
  }

  @MainActor
  private func ok(_ js: String) {
    webView?.evaluateJavaScript("window.__tahtStoreResolve && window.__tahtStoreResolve(\(js))")
  }

  private func purchase(_ productId: String) async {
    do {
      let products = try await Product.products(for: [productId])
      guard let product = products.first else {
        await fail("product_missing")
        return
      }
      let result = try await product.purchase()
      switch result {
      case .success(let verification):
        switch verification {
        case .verified(let transaction):
          await transaction.finish()
          await ok("'\(verification.jwsRepresentation)'")
        case .unverified:
          await fail("unverified")
        }
      case .userCancelled:
        await fail("cancelled")
      case .pending:
        await fail("pending")
      @unknown default:
        await fail("unknown")
      }
    } catch {
      await fail("storekit_error")
    }
  }

  private func restore() async {
    do {
      try await AppStore.sync()
      var receipts: [[String: String]] = []
      for await ent in Transaction.currentEntitlements {
        if case .verified(let t) = ent {
          receipts.append(["productId": t.productID, "receipt": ent.jwsRepresentation])
        }
      }
      let payload = String(data: try JSONEncoder().encode(receipts), encoding: .utf8) ?? "[]"
      await ok(payload)
    } catch {
      await fail("restore_failed")
    }
  }

  private func manage() async {
    guard let scene = await UIApplication.shared.connectedScenes.first as? UIWindowScene else {
      await fail("no_scene")
      return
    }
    do {
      try await AppStore.showManageSubscriptions(in: scene)
      await ok("true")
    } catch {
      await fail("manage_failed")
    }
  }
}
