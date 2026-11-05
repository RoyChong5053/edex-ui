# d3180 deployment

Everything needed to rebuild the d3180 kiosk from a clean checkout. These
files used to live only on the machine; keep this directory as the source of
truth and update it whenever the deployed copy changes.

## Layout

| Repo path | Installed path |
| --- | --- |
| `deploy/systemd/edex.service` | `/etc/systemd/system/edex.service` |
| `deploy/bin/edex-kiosk.sh` | `/usr/local/bin/edex-kiosk.sh` |
| `deploy/bin/edex-user-session.sh` | `/usr/local/bin/edex-user-session.sh` |
| `deploy/bin/edex-ctl` | `/usr/local/bin/edex-ctl` |
| `deploy/bin/edex-start` | `/usr/local/bin/edex-start` |
| `deploy/bin/edex-stop` | `/usr/local/bin/edex-stop` |
| `deploy/bin/edex-status` | `/usr/local/bin/edex-status` |
| `deploy/xorg/20-modesetting.conf` | `/etc/X11/xorg.conf.d/20-modesetting.conf` |

`edex-kiosk.service` (the old always-on variant) is intentionally not shipped:
the machine runs `edex.service` on demand so the cockpit is only resident when
the user asks for it. If the old unit is still installed, disable it:

```bash
sudo systemctl disable --now edex-kiosk.service
```

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
