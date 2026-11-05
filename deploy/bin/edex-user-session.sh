#!/bin/bash
# edex kiosk user session (runs as roychong via runuser)
#   dbus -> openbox (WM) -> edex (fullscreen, supervised) -> x11vnc
# Env: KIOSK_DISPLAY, KIOSK_AUTH, KIOSK_VNCPORT (inherited from edex-kiosk.sh)
set -u
DISPLAY0="${KIOSK_DISPLAY:-:0}"
AUTH="${KIOSK_AUTH:-/run/X0-kiosk}"
VNCPORT="${KIOSK_VNCPORT:-5900}"
export DISPLAY="$DISPLAY0"
export XAUTHORITY="$AUTH"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export XDG_SESSION_TYPE=x11
export XDG_CURRENT_DESKTOP=EDEX

# Logs go to roychong's HOME (writable by this user). Xorg's own logs stay
# under /tmp and are root-owned, written by the root-side edex-kiosk.sh.
LOG=/home/roychong/.edex-kiosk.log
OPENBOX_LOG=/home/roychong/.edex-openbox.log
VNC_LOG=/home/roychong/.edex-vnc.log

# The kiosk gets its own session bus. Using the systemd user bus here made
# WebKitGTK hang during webview creation on this machine (no WebKitWebProcess,
# no window), so keep the private bus that has always worked.
eval "$(dbus-launch --sh-syntax)" || true
export DBUS_SESSION_BUS_ADDRESS

xsetroot -solid "#000000"
# Screen-off is owned by the edex power state machine: 10 minutes of input
# idle -> SLEEP, which also calls `xset dpms force off`.
xset s off +dpms dpms 0 0 600 >/dev/null 2>&1 || true

openbox >"$OPENBOX_LOG" 2>&1 &
x11vnc -display "$DISPLAY0" -forever -shared -rfbauth /home/roychong/.vnc/passwd \
	-rfbport "$VNCPORT" -clear_mods -clear_keys >"$VNC_LOG" 2>&1 &

# edex, supervise (restart on crash)
while true; do
	/opt/edex/edex >>"$LOG" 2>&1
	echo "[$(date)] edex exited rc=$?, restart in 2s" >> "$LOG"
	sleep 2
done
