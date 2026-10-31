#!/bin/bash
# InterviewPro – install as an always-on background service on macOS (launchd).
#
#   bash ~/Documents/interviewpro/deploy/macos/install-service.sh          # install / reinstall
#   bash ~/Documents/interviewpro/deploy/macos/install-service.sh --uninstall
#
# What it does
#   * Copies the site to ~/Library/Application Support/InterviewPro/app
#     (launchd services cannot read ~/Documents without extra macOS privacy permissions)
#   * Starts a web server on http://localhost:${PORT:-8787} at login and keeps it running
#   * Every 30 minutes pulls the latest version from GitHub (main branch) – new releases
#     appear automatically, no reinstall needed
set -euo pipefail

PORT="${PORT:-8787}"
REPO_TARBALL="https://codeload.github.com/rahul576/interview-prep/tar.gz/refs/heads/main"
SRC_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="$HOME/Library/Application Support/InterviewPro"
APP="$BASE/app"
LOGS="$HOME/Library/Logs/InterviewPro"
AGENTS="$HOME/Library/LaunchAgents"
SITE_LABEL="com.interviewpro.site"
UPD_LABEL="com.interviewpro.update"
UID_NUM="$(id -u)"

unload() { launchctl bootout "gui/$UID_NUM/$1" 2>/dev/null || true; }

if [[ "${1:-}" == "--uninstall" ]]; then
  unload "$SITE_LABEL"; unload "$UPD_LABEL"
  rm -f "$AGENTS/$SITE_LABEL.plist" "$AGENTS/$UPD_LABEL.plist"
  echo "InterviewPro service removed. (Files kept in: $BASE)"
  exit 0
fi

# 1. Pick a runtime for the static server
SERVER=()
for n in "$(command -v node 2>/dev/null || true)" /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.nvm/versions/node/"*/bin/node; do
  if [[ -n "$n" && -x "$n" ]]; then SERVER=("$n" "$APP/scripts/serve.mjs" "$PORT"); break; fi
done
if [[ ${#SERVER[@]} -eq 0 ]]; then
  for p in "$(command -v python3 2>/dev/null || true)" /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
    if [[ -n "$p" && -x "$p" ]] && "$p" -c 'import http.server' >/dev/null 2>&1; then
      SERVER=("$p" -m http.server "$PORT" --directory "$APP/www"); break
    fi
  done
fi
if [[ ${#SERVER[@]} -eq 0 ]]; then
  echo "Neither Node.js nor Python 3 was found. Install Node.js (https://nodejs.org or 'brew install node') and run this script again." >&2
  exit 1
fi

# 2. Copy the site out of Documents
mkdir -p "$BASE" "$LOGS" "$AGENTS"
rm -rf "$APP.new"; mkdir -p "$APP.new"
( cd "$SRC_DIR" && tar --exclude='./node_modules' --exclude='./android' --exclude='./ios' --exclude='./.git' -cf - . ) | ( cd "$APP.new" && tar -xf - )
rm -rf "$APP.old"; [[ -d "$APP" ]] && mv "$APP" "$APP.old"; mv "$APP.new" "$APP"; rm -rf "$APP.old"
cp "$SRC_DIR/deploy/macos/update.sh" "$BASE/update.sh"; chmod +x "$BASE/update.sh"
echo "$REPO_TARBALL" > "$BASE/source-url"

xml_args() { for a in "$@"; do printf '    <string>%s</string>\n' "$(printf '%s' "$a" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g')"; done; }

# 3. Web server agent (starts at login, restarted if it stops)
cat > "$AGENTS/$SITE_LABEL.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$SITE_LABEL</string>
  <key>ProgramArguments</key>
  <array>
$(xml_args "${SERVER[@]}")
  </array>
  <key>WorkingDirectory</key><string>$APP</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOGS/site.log</string>
  <key>StandardErrorPath</key><string>$LOGS/site.log</string>
</dict>
</plist>
PLIST

# 4. Auto-update agent (every 30 minutes and at login)
cat > "$AGENTS/$UPD_LABEL.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$UPD_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$BASE/update.sh</string>
  </array>
  <key>StartInterval</key><integer>1800</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOGS/update.log</string>
  <key>StandardErrorPath</key><string>$LOGS/update.log</string>
</dict>
</plist>
PLIST

for L in "$SITE_LABEL" "$UPD_LABEL"; do
  unload "$L"
  launchctl bootstrap "gui/$UID_NUM" "$AGENTS/$L.plist"
done

sleep 2
if curl -fsS -o /dev/null "http://localhost:$PORT/"; then STATUS="running"; else STATUS="starting (check $LOGS/site.log if it does not open)"; fi
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
echo ""
echo "InterviewPro is $STATUS"
echo "  On this Mac:        http://localhost:$PORT"
[[ -n "$LAN_IP" ]] && echo "  On your network:    http://$LAN_IP:$PORT   (camera/mic need https or localhost; use GitHub Pages on other devices)"
echo "  Auto-update:        every 30 minutes from GitHub (main)"
echo "  Logs:               $LOGS"
echo "  Uninstall:          bash \"$0\" --uninstall"
open "http://localhost:$PORT" 2>/dev/null || true
