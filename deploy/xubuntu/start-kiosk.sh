#!/usr/bin/env bash
set -euo pipefail

# SATUSEHAT Dashboard - Xubuntu production kiosk
# Edit URL if the application is served from another path/host.
URL="http://localhost/"

sleep 5

exec chromium \
  --kiosk \
  --start-fullscreen \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --no-first-run \
  "$URL"
