import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

val webOrigin: String = providers.gradleProperty("taht.web.origin").orElse("").get()

android {
    namespace = "com.tahticihan.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.tahticihan.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "WEB_ORIGIN", "\"$webOrigin\"")
        resourceConfigurations += listOf("tr", "en")
    }

    signingConfigs {
        create("debugLocal") {
            storeFile = rootProject.file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        if (keystorePropertiesFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debugLocal")
            isDebuggable = true
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("com.android.billingclient:billing-ktx:7.1.1")
    // HARICI: google-services.json eklendikten sonra açın.
    // implementation("com.google.firebase:firebase-messaging:24.1.0")
}
