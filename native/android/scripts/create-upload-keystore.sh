#!/bin/sh
# Creates a local upload keystore. Do not commit the .jks or keystore.properties.
set -eu
cd "$(dirname "$0")/.."
if [ -f upload-keystore.jks ]; then
  echo "upload-keystore.jks already exists"
  exit 1
fi
keytool -genkeypair -v \
  -keystore upload-keystore.jks \
  -alias tahticihan \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype PKCS12 \
  -dname "CN=TAHT-I CIHAN,O=TahtiCihan,C=TR"
echo "Copy keystore.properties.example to keystore.properties and fill the passwords."
echo "Then: ./gradlew :app:bundleRelease"
