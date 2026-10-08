-keepclassmembers class com.tahticihan.app.BillingBridge {
    *;
}
-keepclassmembers class com.tahticihan.app.BillingBridge$Companion {
    *;
}
-keepclassmembers class com.tahticihan.app.PushBridge {
    *;
}
-keepattributes JavascriptInterface
-dontwarn com.android.billingclient.**
-dontwarn com.google.firebase.**
