#!/bin/bash
# Supervise the eDEX binary (runs as the desktop user, after login).
set -u
LOG=/home/roychong/.edex-kiosk.log

while true; do
	/opt/edex/edex >>"$LOG" 2>&1
	rc=$?
	echo "[$(date)] edex exited rc=$rc, restart in 2s" >>"$LOG"
	sleep 2
done
