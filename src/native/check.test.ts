import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

function must(path: string) {
  assert.ok(existsSync(path), `missing ${path}`);
}

describe("native store shells (files, not compiled archives)", () => {
  it("iOS Xcode project, plist, entitlements, icons, launch, privacy", () => {
    must("/workspace/native/ios/TahtiCihan.xcodeproj/project.pbxproj");
    must("/workspace/native/ios/TahtiCihan/Info.plist");
    must("/workspace/native/ios/TahtiCihan/TahtiCihan.entitlements");
    must("/workspace/native/ios/TahtiCihan/Base.lproj/LaunchScreen.storyboard");
    must("/workspace/native/ios/TahtiCihan/PrivacyInfo.xcprivacy");
    must("/workspace/native/ios/TahtiCihan/Assets.xcassets/AppIcon.appiconset/icon-1024.png");
    must("/workspace/native/ios/ExportOptions.plist");
    const plist = readFileSync("/workspace/native/ios/TahtiCihan/Info.plist", "utf8");
    assert.match(plist, /com.tahticihan.app|PRODUCT_BUNDLE_IDENTIFIER/);
    assert.match(plist, /TAHTWebOrigin/);
    assert.doesNotMatch(plist, /NSUserTrackingUsageDescription/);
    const ent = readFileSync("/workspace/native/ios/TahtiCihan/TahtiCihan.entitlements", "utf8");
    assert.match(ent, /com.apple.developer.applesignin/);
    assert.match(ent, /aps-environment/);
    must("/workspace/native/ios/TahtiCihan/NativeBridge.swift");
  });

  it("Android Gradle app, manifest, adaptive icon, debug keystore, wrapper", () => {
    must("/workspace/native/android/settings.gradle.kts");
    must("/workspace/native/android/app/build.gradle.kts");
    must("/workspace/native/android/app/src/main/AndroidManifest.xml");
    must("/workspace/native/android/app/src/main/java/com/tahticihan/app/MainActivity.kt");
    must("/workspace/native/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml");
    must("/workspace/native/android/gradle/wrapper/gradle-wrapper.jar");
    must("/workspace/native/android/debug.keystore");
    must("/workspace/native/android/keystore.properties.example");
    const gradle = readFileSync("/workspace/native/android/app/build.gradle.kts", "utf8");
    assert.match(gradle, /com\.tahticihan\.app/);
    assert.match(gradle, /bundleRelease|signingConfigs/);
    const manifest = readFileSync("/workspace/native/android/app/src/main/AndroidManifest.xml", "utf8");
    assert.match(manifest, /INTERNET/);
    assert.match(manifest, /BILLING/);
    assert.match(manifest, /tahticihan.app/);
    const billing = readFileSync("/workspace/native/android/app/src/main/java/com/tahticihan/app/BillingBridge.kt", "utf8");
    assert.match(billing, /JSONArray/);
    assert.doesNotMatch(billing, /replace\("=", ":"\)/);
    must("/workspace/native/android/app/src/main/java/com/tahticihan/app/PushBridge.kt");
  });

  it("does not embed TURN secrets or release keystore passwords", () => {
    const ice = readFileSync("/workspace/src/lib/multiplayer/ice.server.ts", "utf8");
    assert.match(ice, /TURN_SECRET/);
    assert.doesNotMatch(ice, /credential:\s*"[\w]{8,}"/);
    assert.equal(existsSync("/workspace/native/android/keystore.properties"), false);
    assert.equal(existsSync("/workspace/native/android/upload-keystore.jks"), false);
  });
});
