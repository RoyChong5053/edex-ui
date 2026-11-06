#!/bin/bash
# eDEX kiosk session loop (runs as the desktop user via runuser).
#
#   dbus -> openbox -> x11vnc -> [login greeter] -> [eDEX] -> back to greeter
#
# The greeter authenticates through PAM. On success it writes
# /tmp/edex-login-ok and keeps its "loading" screen on top; this loop starts
# eDEX behind it and only removes the greeter once eDEX has mapped its window,
# so the login animation flows straight into eDEX's boot overlay.
set -u
DISPLAY0="${KIOSK_DISPLAY:-:0}"
AUTH="${KIOSK_AUTH:-/run/X0-kiosk}"
VNCPORT="${KIOSK_VNCPORT:-5900}"
export DISPLAY="$DISPLAY0"
export XAUTHORITY="$AUTH"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export XDG_SESSION_TYPE=x11
export XDG_CURRENT_DESKTOP=EDEX
# WebKit on this Atom is happiest without the DMA-BUF renderer.
export WEBKIT_DISABLE_DMABUF_RENDERER=1

LOG=/home/roychong/.edex-kiosk.log
OPENBOX_LOG=/home/roychong/.edex-openbox.log
VNC_LOG=/home/roychong/.edex-vnc.log
# Private to the desktop user, so the marker cannot be forged by another user.
OK_FILE="${XDG_RUNTIME_DIR}/edex-login-ok"

# Private session bus: the systemd user bus makes WebKitGTK hang on this box.
eval "$(dbus-launch --sh-syntax)" || true
export DBUS_SESSION_BUS_ADDRESS

xsetroot -solid "#000000"
# Screen-off is owned by the eDEX power state machine.
xset s off +dpms dpms 0 0 600 >/dev/null 2>&1 || true

openbox >"$OPENBOX_LOG" 2>&1 &
x11vnc -display "$DISPLAY0" -forever -shared -rfbauth /home/roychong/.vnc/passwd \
	-rfbport "$VNCPORT" -clear_mods -clear_keys >"$VNC_LOG" 2>&1 &

while true; do
	rm -f "$OK_FILE"
	/usr/local/bin/edex-greeter >>"$LOG" 2>&1 &
	GREETER_PID=$!

	while kill -0 "$GREETER_PID" 2>/dev/null; do
		[ -f "$OK_FILE" ] && break
		sleep 0.2
	done

	if [ ! -f "$OK_FILE" ]; then
		wait "$GREETER_PID" 2>/dev/null
		echo "[$(date)] greeter exited without auth; restarting" >>"$LOG"
		sleep 1
		continue
	fi

	echo "[$(date)] login accepted; starting eDEX behind the greeter" >>"$LOG"
	/usr/local/bin/edex-run.sh >>"$LOG" 2>&1 &
	SESSION_PID=$!

	# Wait for the backend socket, then for the fullscreen window to map.
	for _ in $(seq 1 120); do
		[ -S /tmp/edex-1000.sock ] && break
		sleep 0.25
	done
	for _ in $(seq 1 40); do
		xdotool search --name '^EDEX-UI$' >/dev/null 2>&1 && break
		sleep 0.25
	done
	# Let the webview paint its boot overlay before we reveal it.
	sleep 0.8

	kill "$GREETER_PID" 2>/dev/null
	wait "$GREETER_PID" 2>/dev/null
	echo "[$(date)] greeter removed; eDEX is live" >>"$LOG"

	# eDEX supervises itself; this blocks until the session ends.
	wait "$SESSION_PID"
	echo "[$(date)] eDEX session ended; returning to greeter" >>"$LOG"
done
