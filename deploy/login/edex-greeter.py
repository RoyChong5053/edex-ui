#!/usr/bin/python3
"""eDEX-UI login greeter.

A small, self-contained replacement for a display manager's greeter. It renders
the animated HTML login screen in a WebKit view (as the normal desktop user, so
the WebKit sandbox stays intact) and authenticates through PAM via a narrow,
root-owned helper (`edex-auth`, invoked with a NOPASSWD sudoers rule).

Flow:
  1. show the looping login animation
  2. on submit, ask `edex-auth` to verify the credentials
  3. on success, touch /tmp/edex-login-ok and switch the page to the boot
     animation, then stay alive
  4. the launcher script (edex-greeter-loop.sh) starts eDEX behind us and
     SIGTERMs us once eDEX's window is mapped, so the hand-off looks like one
     continuous boot sequence.

The greeter never sees a shell or runs user input as a command.
"""

import json
import os
import signal
import subprocess
import sys
import threading

import gi

gi.require_version("Gdk", "3.0")
gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import Gdk, GLib, Gtk, WebKit2  # noqa: E402

HTML_PATH = "/usr/local/share/edex/greeter.html"
AUTH_HELPER = "/usr/local/libexec/edex-auth"
PAM_SERVICE = "edex-greeter"
# Private to the desktop user (XDG_RUNTIME_DIR is mode 0700), so another local
# account cannot fake a successful login by creating the marker file.
OK_FILE = os.path.join(
    os.environ.get("XDG_RUNTIME_DIR", "/run/user/1000"), "edex-login-ok"
)
# The kiosk session (openbox, eDEX, VNC) always runs as this user, so only this
# account may unlock the console. Any other valid account is refused rather
# than silently dropped into roychong's session.
ALLOWED_USER = "roychong"


def log(message: str) -> None:
    print(f"[edex-greeter] {message}", file=sys.stderr, flush=True)


class Greeter:
    def __init__(self) -> None:
        self.window = Gtk.Window()
        self.window.set_title("EDEX-UI // SECURE ACCESS")
        self.window.set_decorated(False)
        self.window.set_default_size(1366, 768)
        self.window.move(0, 0)
        self.window.fullscreen()
        # Keep the loading animation on top of the eDEX window while the
        # session boots; the launcher kills us once eDEX is ready.
        self.window.set_keep_above(True)
        self.window.set_app_paintable(True)
        self.window.connect("destroy", lambda _w: Gtk.main_quit())
        self.window.connect("key-press-event", self.on_key)

        self.webview = WebKit2.WebView()
        self.webview.set_background_color(Gdk.RGBA(0.01, 0.02, 0.03, 1.0))
        settings = self.webview.get_settings()
        settings.set_enable_webgl(False)
        settings.set_enable_developer_extras(False)
        settings.set_enable_html5_database(False)
        settings.set_enable_html5_local_storage(False)

        manager = self.webview.get_user_content_manager()
        manager.register_script_message_handler("edex")
        manager.connect("script-message-received::edex", self.on_message)

        self.webview.load_uri("file://" + HTML_PATH)
        self.window.add(self.webview)
        self.window.show_all()

    # -- JS -> Python ----------------------------------------------------
    def on_message(self, _manager, result) -> None:
        try:
            payload = json.loads(result.get_js_value().to_string())
        except (TypeError, ValueError):
            log("ignoring malformed webview message")
            return
        if payload.get("type") != "login":
            return
        username = str(payload.get("username", "")).strip()
        password = str(payload.get("password", ""))
        if not username or not password:
            self.call_js("window.edex.failed('Credentials incomplete')")
            return
        if username != ALLOWED_USER:
            self.call_js("window.edex.failed('Operator not authorized')")
            return
        # Authenticate on a worker thread so the animation keeps running.
        threading.Thread(
            target=self._auth_worker, args=(username, password), daemon=True
        ).start()

    def _auth_worker(self, username: str, password: str) -> None:
        ok, detail = self.authenticate(username, password)
        GLib.idle_add(self._finish_auth, ok, detail)

    def authenticate(self, username: str, password: str):
        try:
            proc = subprocess.run(
                ["/usr/bin/sudo", "-n", AUTH_HELPER, PAM_SERVICE, username],
                input=password + "\n",
                text=True,
                capture_output=True,
                timeout=15,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            log(f"auth helper failed: {exc}")
            return False, "Authentication service unavailable"
        if proc.returncode == 0:
            return True, ""
        detail = (proc.stderr or "").strip().splitlines()
        return False, detail[-1] if detail else "Access denied"

    def _finish_auth(self, ok: bool, detail: str) -> bool:
        if ok:
            try:
                with open(OK_FILE, "w", encoding="utf-8") as handle:
                    handle.write(str(os.getpid()))
            except OSError as exc:
                log(f"cannot write {OK_FILE}: {exc}")
                self.call_js("window.edex.failed('Session hand-off failed')")
                return False
            log("authentication accepted; waiting for session hand-off")
            self.call_js("window.edex.granted()")
        else:
            log("authentication rejected")
            self.call_js(f"window.edex.failed({json.dumps(detail)})")
        return False

    # -- Python -> JS ----------------------------------------------------
    def call_js(self, script: str) -> None:
        try:
            self.webview.evaluate_javascript(
                script, -1, None, None, None, None, None
            )
        except Exception:  # pragma: no cover - older WebKit fallback
            try:
                self.webview.run_javascript(script, None, None, None)
            except Exception as exc:
                log(f"evaluate_javascript failed: {exc}")

    def on_key(self, _widget, event) -> bool:
        # Escape clears the password rather than dropping to a shell.
        if event.keyval == Gdk.KEY_Escape:
            self.call_js(
                "document.getElementById('pass').value='';"
                "document.getElementById('pass').focus();"
            )
            return True
        return False


def main() -> int:
    if not os.path.exists(HTML_PATH):
        log(f"missing {HTML_PATH}")
        return 1

    greeter = Greeter()

    def shutdown(*_args) -> None:
        try:
            Gtk.main_quit()
        except Exception:
            pass

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    Gtk.main()
    log("exiting")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
