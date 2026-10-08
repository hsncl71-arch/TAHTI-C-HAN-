# TAHT-I CİHAN — iOS ve Android kabukları

Oyuncu ürünü iOS ve Android uygulamalarıdır. Ayrı bir tarayıcı oyunu, PWA veya web ödeme yoktur. Kabuk, yayıncının HTTPS adresindeki aynı saltanatı güvenli pencerede açar. Adres yazılmadan oyun uydurulmaz; kapı ekranı kalır.

Bu Linux ortamında imzalı arşiv üretilemez (Xcode ve Play yükleme anahtarı yok).

Apple Developer hesabı **var**. Eksik olan Team ID, ürünler, anahtarlar ve Mac’te Archive’dır — hesap yok varsayımı kalkmıştır.

## You must set before store upload

1. Deployed HTTPS origin of the web app.
   - iOS: `native/ios/Config.xcconfig` → `TAHT_WEB_ORIGIN = https://…`
   - Android: `native/android/gradle.properties` → `taht.web.origin=https://…`
2. Apple Developer **Team ID** into `DEVELOPMENT_TEAM` and `ExportOptions.plist`. Enable Sign in with Apple + Push on App ID `com.tahticihan.app`.
3. Google Play Console application id `com.tahticihan.app`.
4. Upload keystore: `native/android/scripts/create-upload-keystore.sh` then `keystore.properties`.
5. StoreKit / Play product IDs matching `src/domains/commerce/catalog.ts`.
6. TURN (optional for P2P mesh, **not** required for server-authoritative meydan):
   - `TURN_URLS`
   - `TURN_SECRET` (coturn REST) **or** `TURN_USERNAME` + `TURN_CREDENTIAL`
7. Push (optional until you want meydan notifications while the app is closed):
   - iOS: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`
   - Android: `FIREBASE_SERVICE_ACCOUNT` or `FCM_SERVER_KEY` + `google-services.json`
8. Sign in with Apple (App Store 4.8, because Google/X exist):
   - `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, optional `APPLE_APP_BUNDLE_IDENTIFIER=com.tahticihan.app`
9. Two real human accounts on two devices for live field QA.

Universal Links: replace `TEAMID` in `public/.well-known/apple-app-site-association`.  
App Links: replace SHA-256 in `public/.well-known/assetlinks.json`.

## iOS archive (Mac)

```
open native/ios/TahtiCihan.xcodeproj
# Signing & Capabilities → your team
# Product → Archive → Distribute App
```

`ExportOptions.plist` needs your Team ID.

## Android AAB

```
cd native/android
./gradlew :app:bundleRelease
# out: app/build/outputs/bundle/release/app-release.aab
```

Release signing is skipped until `keystore.properties` exists. Debug keystore is only for local USB install.

## What is already in the repo

- App icons, launch screen, adaptive icon, Info.plist, entitlements (Push + Sign in with Apple + associated domains), privacy manifest
- Android Manifest, splash, network security (HTTPS only), App Links filter, notification permission request
- StoreKit 2 and Play Billing bridges (fail closed if products missing; no sandbox fallback on device)
- Push token registration bridge (iOS NativeBridge + Android PushBridge reflection). Delivery HTTP is coded; it stays queued until APNs/FCM secrets exist.
- Deep link mapping `tahticihan://` → HTTPS origin
- Safe-area / cutout / back button
