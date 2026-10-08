package com.tahticihan.app

import android.app.Activity
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import org.json.JSONArray
import org.json.JSONObject

/**
 * Play Billing bridge. Never resolves a purchase as success without a Play token.
 */
class BillingBridge(
    private val activity: Activity,
    private val webView: WebView,
) : PurchasesUpdatedListener {
    private val client: BillingClient = BillingClient.newBuilder(activity)
        .setListener(this)
        .enablePendingPurchases(
            com.android.billingclient.api.PendingPurchasesParams.newBuilder().enableOneTimeProducts().build(),
        )
        .build()

    init {
        connect()
    }

    private fun connect() {
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) = Unit
            override fun onBillingServiceDisconnected() {
                activity.runOnUiThread { connect() }
            }
        })
    }

    @JavascriptInterface
    fun purchase(productId: String) {
        if (!client.isReady) {
            reject("billing_not_ready")
            return
        }
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId)
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        val inapp = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId)
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
        queryAndLaunch(listOf(product)) { ok ->
            if (!ok) queryAndLaunch(listOf(inapp)) { found ->
                if (!found) reject("product_missing")
            }
        }
    }

    private fun queryAndLaunch(products: List<QueryProductDetailsParams.Product>, done: (Boolean) -> Unit) {
        val params = QueryProductDetailsParams.newBuilder().setProductList(products).build()
        client.queryProductDetailsAsync(params) { result, detailsResult ->
            val list = detailsResult.productDetailsList
            if (result.responseCode != BillingClient.BillingResponseCode.OK || list.isNullOrEmpty()) {
                done(false)
                return@queryProductDetailsAsync
            }
            val details: ProductDetails = list[0]
            val offer = details.subscriptionOfferDetails?.firstOrNull()
            val paramsFlow = if (offer != null) {
                BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details)
                    .setOfferToken(offer.offerToken)
                    .build()
            } else {
                BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details)
                    .build()
            }
            val flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(paramsFlow))
                .build()
            activity.runOnUiThread {
                client.launchBillingFlow(activity, flow)
            }
            done(true)
        }
    }

    @JavascriptInterface
    fun restore() {
        val acc = JSONArray()
        fun append(purchases: List<Purchase>) {
            for (p in purchases) {
                if (p.purchaseState == Purchase.PurchaseState.PURCHASED && !p.isAcknowledged) {
                    client.acknowledgePurchase(
                        AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.purchaseToken).build(),
                    ) { }
                }
                val o = JSONObject()
                o.put("productId", p.products.firstOrNull() ?: "")
                o.put("receipt", p.purchaseToken)
                acc.put(o)
            }
        }
        val subs = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
        client.queryPurchasesAsync(subs) { _, purchases ->
            append(purchases)
            val inapp = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()
            client.queryPurchasesAsync(inapp) { _, more ->
                append(more)
                resolve(acc.toString())
            }
        }
    }

    @JavascriptInterface
    fun manageSubscriptions() {
        val uri = android.net.Uri.parse("https://play.google.com/store/account/subscriptions")
        activity.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri))
        resolve("true")
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        if (result.responseCode != BillingClient.BillingResponseCode.OK || purchases.isNullOrEmpty()) {
            reject(if (result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) "cancelled" else "billing_error")
            return
        }
        val purchase = purchases[0]
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) {
            reject("pending")
            return
        }
        if (!purchase.isAcknowledged) {
            client.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build(),
            ) { }
        }
        resolve("'${purchase.purchaseToken}'")
    }

    private fun reject(code: String) = eval("window.__tahtStoreReject && window.__tahtStoreReject(new Error('$code'))")
    private fun resolve(js: String) = eval("window.__tahtStoreResolve && window.__tahtStoreResolve($js)")
    private fun eval(js: String) {
        webView.post { webView.evaluateJavascript(js, null) }
    }

    companion object {
        const val BRIDGE_JS = """
                window.TahtNative = Object.assign(window.TahtNative || {}, { platform: "android" });
                window.PlayBilling = {
                  purchase: (id) => new Promise((resolve, reject) => {
                    window.__tahtStoreResolve = resolve;
                    window.__tahtStoreReject = reject;
                    window.PlayBillingNative.purchase(String(id || ""));
                  }),
                  restore: () => new Promise((resolve, reject) => {
                    window.__tahtStoreResolve = resolve;
                    window.__tahtStoreReject = reject;
                    window.PlayBillingNative.restore();
                  }),
                  manageSubscriptions: () => new Promise((resolve) => {
                    window.__tahtStoreResolve = resolve;
                    window.PlayBillingNative.manageSubscriptions();
                  })
                };
                """

        fun install(webView: WebView, activity: Activity): BillingBridge {
            val bridge = BillingBridge(activity, webView)
            webView.addJavascriptInterface(bridge, "PlayBillingNative")
            inject(webView)
            return bridge
        }

        fun inject(webView: WebView) {
            webView.evaluateJavascript(BRIDGE_JS.trimIndent(), null)
        }
    }
}
