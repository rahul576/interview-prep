#!/bin/bash
# InterviewPro auto-updater (run by launchd). Downloads the latest main branch from GitHub
# and swaps it in atomically. Keeps the current version if anything fails.
set -uo pipefail
BASE="$HOME/Library/Application Support/InterviewPro"
APP="$BASE/app"
URL="$(cat "$BASE/source-url" 2>/dev/null || echo https://codeload.github.com/rahul576/interview-prep/tar.gz/refs/heads/main)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ts() { date '+%Y-%m-%d %H:%M:%S'; }

if ! curl -fsSL --max-time 120 "$URL" -o "$TMP/site.tgz"; then echo "$(ts) download failed, keeping current version"; exit 0; fi
mkdir "$TMP/x" && tar -xzf "$TMP/site.tgz" -C "$TMP/x" || { echo "$(ts) extract failed"; exit 0; }
NEW="$(find "$TMP/x" -mindepth 1 -maxdepth 1 -type d | head -1)"
[[ -f "$NEW/www/index.html" && -f "$NEW/scripts/serve.mjs" ]] || { echo "$(ts) unexpected archive layout"; exit 0; }

NEW_SUM="$(cd "$NEW/www" && find . -type f -exec shasum {} + | sort | shasum | cut -c1-12)"
OLD_SUM="$(cat "$BASE/version" 2>/dev/null || true)"
if [[ "$NEW_SUM" == "$OLD_SUM" ]]; then echo "$(ts) up to date ($NEW_SUM)"; exit 0; fi

rm -rf "$APP.new" && cp -R "$NEW" "$APP.new"
rm -rf "$APP.old"; [[ -d "$APP" ]] && mv "$APP" "$APP.old"; mv "$APP.new" "$APP"; rm -rf "$APP.old"
echo "$NEW_SUM" > "$BASE/version"
# restart the web server so it serves from the new folder
launchctl kickstart -k "gui/$(id -u)/com.interviewpro.site" 2>/dev/null || true
echo "$(ts) updated to $NEW_SUM"
