#!/bin/bash
# Double-click to install InterviewPro into your Applications folder and open it.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/InterviewPro.app"
[ -d "$SRC" ] || SRC="$HERE/../../../dist/InterviewPro.app"
DEST="$HOME/Applications/InterviewPro.app"
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
chmod +x "$DEST/Contents/MacOS/InterviewPro"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
touch "$DEST"
echo "Installed to $DEST"
open "$DEST"
