#!/usr/bin/env bash
set -euo pipefail

VITE_HOST="${VITE_HOST:-127.0.0.1}"
VITE_PORT="${VITE_PORT:-5173}"
APP_URL="${APP_URL:-http://127.0.0.1:${VITE_PORT}}"
WINDOW_TITLE="${WINDOW_TITLE:-PID Kiosk}"
KIOSK_WIDTH="${KIOSK_WIDTH:-320}"
KIOSK_HEIGHT="${KIOSK_HEIGHT:-480}"
CHROME_PROFILE="${CHROME_PROFILE:-/tmp/pitune-chromium-profile}"

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

if command -v pnpm >/dev/null 2>&1; then
  PACKAGE_RUNNER=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  PACKAGE_RUNNER=(corepack pnpm)
else
  echo "pnpm was not found. Install pnpm or enable corepack." >&2
  exit 1
fi

"${PACKAGE_RUNNER[@]}" dev --host "$VITE_HOST" --port "$VITE_PORT" --strictPort >/tmp/pitune-vite.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 80); do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  echo "Vite failed to start. Check /tmp/pitune-vite.log or set VITE_PORT to a free port." >&2
  exit 1
fi

CHROME_BIN="${CHROME_BIN:-}"
if [ -z "$CHROME_BIN" ]; then
  CHROME_BIN="$(command -v chromium-browser || command -v chromium || command -v google-chrome || true)"
fi

if [ -z "$CHROME_BIN" ]; then
  echo "Chromium or Chrome was not found. Install chromium-browser or set CHROME_BIN." >&2
  exit 1
fi

"$CHROME_BIN" \
  --app="$APP_URL" \
  --kiosk \
  --start-fullscreen \
  --window-size="${KIOSK_WIDTH},${KIOSK_HEIGHT}" \
  --force-device-scale-factor=1 \
  --user-data-dir="$CHROME_PROFILE" \
  --ash-hide-cursor \
  --disable-gpu \
  --no-first-run \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --class="$WINDOW_TITLE" \
  >/tmp/pitune-chromium.log 2>&1 &
CHROME_PID=$!

if command -v wmctrl >/dev/null 2>&1; then
  for _ in $(seq 1 40); do
    if wmctrl -r "$WINDOW_TITLE" -b add,above,fullscreen >/dev/null 2>&1; then
      break
    fi
    wmctrl -r "pitune" -b add,above,fullscreen >/dev/null 2>&1 && break
    sleep 0.2
  done
fi

wait "$CHROME_PID"
