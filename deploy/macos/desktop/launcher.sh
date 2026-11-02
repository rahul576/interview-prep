#!/bin/bash
# InterviewPro desktop launcher (macOS).
# 1. Uses the always-on InterviewPro service on port 8787 if it is running.
# 2. Otherwise starts a local server from the newest copy available.
# 3. Opens the app in its own window (Chrome/Edge app mode, so voice answers work), else Safari.
PORT="${INTERVIEWPRO_PORT:-8787}"
URL="http://localhost:$PORT/"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$HOME/Library/Logs/InterviewPro-desktop.log"
mkdir -p "$(dirname "$LOG")"

up() { /usr/bin/curl -fsS -o /dev/null --max-time 2 "$URL"; }

if ! up; then
  # Prefer the auto-updated service copy, then the copy bundled in this app.
  SITE=""
  for d in "$HOME/Library/Application Support/InterviewPro/app" "$HOME/Documents/interviewpro" "$HERE/Resources/site"; do
    if [ -f "$d/scripts/serve.mjs" ]; then SITE="$d"; break; fi
  done
  NODE="$(command -v node 2>/dev/null)"
  for n in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.volta/bin/node"; do [ -z "$NODE" ] && [ -x "$n" ] && NODE="$n"; done
  if [ -n "$NODE" ] && [ -n "$SITE" ]; then
    nohup "$NODE" "$SITE/scripts/serve.mjs" "$PORT" >>"$LOG" 2>&1 &
  elif [ -n "$SITE" ]; then
    (cd "$SITE/www" && nohup /usr/bin/python3 -m http.server "$PORT" --bind 127.0.0.1 >>"$LOG" 2>&1 &)
  else
    /usr/bin/osascript -e 'display alert "InterviewPro" message "The app files could not be found. Reinstall InterviewPro."'
    exit 1
  fi
  for _ in $(seq 1 40); do up && break; sleep 0.25; done
fi

for b in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium" "Arc"; do
  if /usr/bin/open -Ra "$b" >/dev/null 2>&1; then
    exec /usr/bin/open -na "$b" --args --app="$URL" --window-size=1440,920
  fi
done
exec /usr/bin/open -a Safari "$URL"
