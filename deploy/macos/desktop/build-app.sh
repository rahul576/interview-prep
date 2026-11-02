#!/bin/bash
# Assemble InterviewPro.app from this repository. Works on macOS or Linux.
# Usage: deploy/macos/desktop/build-app.sh [output-dir]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="${1:-$ROOT/dist}"
VERSION="$(node -p "require('$ROOT/package.json').version" 2>/dev/null || echo 1.0.0)"
APP="$OUT/InterviewPro.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/site"
sed "s/__VERSION__/$VERSION/g" "$ROOT/deploy/macos/desktop/Info.plist" > "$APP/Contents/Info.plist"
cp "$ROOT/deploy/macos/desktop/launcher.sh" "$APP/Contents/MacOS/InterviewPro"
chmod +x "$APP/Contents/MacOS/InterviewPro"
cp -R "$ROOT/www" "$ROOT/scripts" "$ROOT/package.json" "$APP/Contents/Resources/site/"
if [ -f "$ROOT/deploy/macos/desktop/AppIcon.icns" ]; then cp "$ROOT/deploy/macos/desktop/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"; fi
echo "Built $APP ($VERSION)"
