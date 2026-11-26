#!/usr/bin/env bash
# Baut die Android-APK (WebView + eigener Asset-Handler) ohne Gradle: aapt2 + javac + d8 + zipalign + apksigner.
# Aufruf: android/build.sh   (Umgebung: OUT=<apk-pfad>, KS_DIR=<keystore-ordner>, VC/VN = Versionscode/-name)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(dirname "$HERE")"
OUT=${OUT:-$ROOT/../Ballerburg3D.apk}
KS_DIR=${KS_DIR:-$ROOT/../keystore}          # Keystore liegt AUSSERHALB des Repos und wird nie committet
VC=${VC:-3}; VN=${VN:-2.1}
for c in "${ANDROID_HOME:-}" /workspace/tetris/sdk; do
  [ -n "$c" ] && [ -f "$c/env.sh" ] && { . "$c/env.sh"; break; }
done
[ -n "${ANDROID_HOME:-}" ] && [ -x "${JAVA_HOME:-}/bin/javac" ] || { echo "ANDROID_HOME/JAVA_HOME fehlen (JDK 17, Build-Tools 34, Platform 34)." >&2; exit 1; }
BT=$ANDROID_HOME/build-tools/34.0.0; AJAR=$ANDROID_HOME/platforms/android-34/android.jar
W=$HERE/work-apk; rm -rf "$W"; mkdir -p "$W/res" "$W/classes" "$W/dex" "$W/assets"
# Web-Spiel als Assets (ohne Tests, Service Worker wird im WebView nicht genutzt)
cp -r "$ROOT/index.html" "$ROOT/css" "$ROOT/src" "$ROOT/lib" "$ROOT/icon.svg" "$ROOT/manifest.webmanifest" "$W/assets/"
"$BT/aapt2" compile --dir "$HERE/res" -o "$W/res/res.zip"
"$BT/aapt2" link -o "$W/base.apk" -I "$AJAR" --manifest "$HERE/AndroidManifest.xml" -A "$W/assets" "$W/res/res.zip" --java "$W/gen" \
  --min-sdk-version 26 --target-sdk-version 34 --version-code "$VC" --version-name "$VN"
javac -source 11 -target 11 -nowarn -classpath "$AJAR" -d "$W/classes" $(find "$HERE/src" "$W/gen" -name '*.java') 2>&1 | grep -v "bootstrap classpath" || true
"$BT/d8" --release --min-api 26 --lib "$AJAR" --output "$W/dex" $(find "$W/classes" -name '*.class')
cp "$W/base.apk" "$W/unsigned.apk"
python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'a',zipfile.ZIP_DEFLATED); z.write(sys.argv[2],'classes.dex'); z.close()" "$W/unsigned.apk" "$W/dex/classes.dex"
"$BT/zipalign" -f -p 4 "$W/unsigned.apk" "$W/aligned.apk"
KS=$KS_DIR/ballerburg.jks; PF=$KS_DIR/.storepass
if [ ! -f "$KS" ]; then
  mkdir -p "$KS_DIR"; umask 077
  python3 -c "import secrets;print(secrets.token_urlsafe(18))" > "$PF"; P=$(cat "$PF")
  keytool -genkeypair -keystore "$KS" -storepass "$P" -keypass "$P" -alias ballerburg -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Ballerburg 3D, O=CK, C=DE" >/dev/null 2>&1
  echo "Neuer Keystore: $KS (Passwort in $PF) – nicht committen, für Updates aufbewahren."
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass "file:$PF" --ks-key-alias ballerburg --out "$OUT" "$W/aligned.apk"
"$BT/apksigner" verify --verbose "$OUT" | head -4
rm -f "$OUT.idsig"; ls -la "$OUT"
