#!/usr/bin/env bash
# Creates the signing key for release builds of the Rosier People Android app
# and prints the four GitHub secrets the build workflow needs.
#
#   bash scripts/android-keystore.sh
#
# Needs Java (keytool). KEEP rosier-release.jks AND THE PASSWORD SAFE:
# every future update to the app must be signed with this same key.
set -euo pipefail

OUT="${1:-rosier-release.jks}"
ALIAS="rosier-people"
if [ -e "$OUT" ]; then echo "$OUT already exists — not overwriting."; exit 1; fi
command -v keytool >/dev/null || { echo "keytool not found. Install a JDK (e.g. Temurin 21) first."; exit 1; }

read -rsp "Choose a keystore password (8+ characters): " PASS; echo
[ ${#PASS} -ge 8 ] || { echo "Too short."; exit 1; }

keytool -genkeypair -v -keystore "$OUT" -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" \
  -dname "CN=Rosier People, O=Rosier Foods Private Limited, L=Ghaziabad, ST=Uttar Pradesh, C=IN" >/dev/null

B64="$(base64 < "$OUT" | tr -d '\n')"
cat <<MSG

✓ Created $OUT

Add these in GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret:

  ANDROID_KEYSTORE_BASE64   (the long value saved in ${OUT}.base64.txt)
  ANDROID_KEYSTORE_PASSWORD $PASS
  ANDROID_KEY_ALIAS         $ALIAS
  ANDROID_KEY_PASSWORD      $PASS

Then store $OUT and the password in your password manager and delete ${OUT}.base64.txt.
Never commit the .jks file.
MSG
printf '%s' "$B64" > "${OUT}.base64.txt"
