#!/bin/bash
# edex kiosk launcher (root, systemd) — replaces the display manager.
#   Xorg (root) -> runuser roychong -> edex-greeter-loop.sh
# Env: KIOSK_DISPLAY (default :0), KIOSK_AUTH, KIOSK_VNCPORT
set -u
DISPLAY0="${KIOSK_DISPLAY:-:0}"
AUTH="${KIOSK_AUTH:-/run/X0-kiosk}"
VNCPORT="${KIOSK_VNCPORT:-5900}"
LOG=/tmp/edex-kiosk.log
export DISPLAY="$DISPLAY0"
export XAUTHORITY="$AUTH"

cleanup() {
  echo "[$(date)] edex-kiosk stopping, cleaning up" >> "$LOG"
  pkill -9 -f edex-greeter 2>/dev/null
  pkill -9 -x Xorg 2>/dev/null
  pkill -9 -x x11vnc 2>/dev/null
  pkill -9 -x edex 2>/dev/null
  pkill -9 -x openbox 2>/dev/null
}
trap cleanup TERM INT

# Release the DRM device from plymouth. Keep the last splash frame so the
# hand-off to Xorg is a fade from the boot screen rather than a text flash.
plymouth quit --retain-splash >/dev/null 2>&1 || true

# Xorg: use the REAL binary (bypasses /usr/bin/Xorg which is a wrapper that
# rejects non-console users with "Only console users are allowed to run the X server").
# It creates the AUTH cookie file (Xorg -auth).
rm -f "$AUTH"
/usr/lib/xorg/Xorg "$DISPLAY0" -nolisten tcp -novtswitch \
  >/tmp/xorg-kiosk.log 2>&1 &
XORG_PID=$!
# Wait for X to actually come up (xdpyinfo needs the AUTH cookie).
for _ in $(seq 1 60); do
  xdpyinfo >/dev/null 2>&1 && break
  sleep 0.5
done
chmod 644 "$AUTH" 2>/dev/null || true
echo "[$(date)] Xorg up on $DISPLAY0 (pid $XORG_PID)" >> "$LOG"

# Hand off to the roychong session (dbus -> openbox -> greeter -> edex -> vnc).
# exec so the service PID becomes the user session; systemd's control-group
# teardown (KillMode=control-group) cleans Xorg/vnc when the service stops.
exec env KIOSK_DISPLAY="$DISPLAY0" KIOSK_AUTH="$AUTH" KIOSK_VNCPORT="$VNCPORT" \
  runuser -u roychong -- /usr/local/bin/edex-greeter-loop.sh
