# d3180 deployment

Everything needed to rebuild the d3180 kiosk from a clean checkout. These
files used to live only on the machine; keep this directory as the source of
truth and update it whenever the deployed copy changes.

## Layout

| Repo path | Installed path |
| --- | --- |
| `deploy/systemd/edex.service` | `/etc/systemd/system/edex.service` |
| `deploy/bin/edex-kiosk.sh` | `/usr/local/bin/edex-kiosk.sh` |
| `deploy/bin/edex-greeter-loop.sh` | `/usr/local/bin/edex-greeter-loop.sh` |
| `deploy/bin/edex-run.sh` | `/usr/local/bin/edex-run.sh` |
| `deploy/bin/edex-ctl` | `/usr/local/bin/edex-ctl` |
| `deploy/bin/edex-start` | `/usr/local/bin/edex-start` |
| `deploy/bin/edex-stop` | `/usr/local/bin/edex-stop` |
| `deploy/bin/edex-status` | `/usr/local/bin/edex-status` |
| `deploy/login/greeter.html` | `/usr/local/share/edex/greeter.html` |
| `deploy/login/edex-greeter.py` | `/usr/local/bin/edex-greeter` |
| `deploy/login/edex-auth` | `/usr/local/libexec/edex-auth` |
| `deploy/pam/edex-greeter` | `/etc/pam.d/edex-greeter` |
| `deploy/pam/systemd-user` | `/etc/pam.d/systemd-user` |
| `deploy/sudoers/edex-greeter` | `/etc/sudoers.d/edex-greeter` |
| `deploy/modprobe/edex-quiet.conf` | `/etc/modprobe.d/edex-quiet.conf` |
| `deploy/plymouth/edex/*` | `/usr/share/plymouth/themes/edex/*` |
| `deploy/xorg/20-modesetting.conf` | `/etc/X11/xorg.conf.d/20-modesetting.conf` |

`edex-kiosk.service` (the old always-on variant) is intentionally not shipped:
the machine runs `edex.service` on demand so the cockpit is only resident when
the user asks for it. If the old unit is still installed, disable it:

```bash
sudo systemctl disable --now edex-kiosk.service
```

## Boot, greeter and session

This machine runs **no display manager**: `edex.service` starts Xorg, the login
greeter, the openbox session, VNC and eDEX directly. On boot the sequence is:

```
plymouth splash → Xorg → greeter (login) → [login] → eDEX boot overlay → cockpit
```

- **`edex-greeter`** (Python 3 + GTK3 + WebKit2) renders the animated login
  screen (`greeter.html`). It authenticates through PAM using a narrow,
  root-owned helper (`edex-auth`) invoked with a `NOPASSWD` sudoers rule. The
  password only ever touches the helper's stdin — never a shell, argv, or the
  process list — and only the `roychong` account can unlock the console.
- **`edex-greeter-loop.sh`** (run as `roychong` via `runuser`) drives the
  session. On success it starts eDEX *behind* the still-present greeter, waits
  for eDEX's window to map, then removes the greeter — so the login animation
  flows straight into eDEX's boot overlay instead of popping in.
- **`edex-run.sh`** supervises the eDEX binary so a crash restarts the cockpit.

Notes:

- Boot noise is suppressed by blacklisting `cros_charge_control` and
  `snd_soc_rt5640` (the audio path actually uses `rt5645`), a fresh
  `/etc/pam.d/systemd-user` (fixes the "pam.d not supported" warning), a quiet
  GRUB cmdline, and a custom eDEX plymouth theme. `plymouth-set-default-theme
  edex -R` rebuilds the initramfs so the splash shows before the root mount.
- `edex-stop` returns the console to a text login by starting `getty@tty1`.

## Build and install

Build on d3180 — do not copy a binary from another machine (glibc and
webkit2gtk versions differ).

```bash
ssh d3180
cd ~/edex-ui-build
export PATH=$HOME/.cargo/bin:$PATH
pnpm type-check
pnpm vite-build
cargo test --manifest-path src-tauri/Cargo.toml
cargo build --release --manifest-path src-tauri/Cargo.toml
sudo install -m 755 src-tauri/target/release/edex /opt/edex/edex
sudo systemctl restart edex.service
```

`pnpm vite-build` runs `tsc` before Vite, so the Rust binary embeds a
type-checked frontend.

## Control socket

`edex-ctl` talks to `/tmp/edex-1000.sock` (mode 0600, owned by the running
user):

```bash
edex-ctl status          # state, focus, heartbeat_age_ms, reload_count
edex-ctl thaw            # wake now
edex-ctl freeze          # manual freeze (survives focus changes)
edex-ctl sleep           # sleep + DPMS off
edex-ctl reload          # reload the webview (PTYs keep running)
edex-ctl toggle
edex-ctl showcase on|off
edex-ctl theme <name>
```

`heartbeat_age_ms` should stay below ~3000 while the UI is active. If it grows
past 10s, the Rust watchdog reloads the page automatically; `reload_count`
records how often that has happened.

## Session / IME

`edex-user-session.sh` currently does **not** start `fcitx5` or source
`~/.xprofile`, so Chinese input is unavailable. That is tracked as part of M2
(keyboard/IME); update the script and this directory together when it lands.
