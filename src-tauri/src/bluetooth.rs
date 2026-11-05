//! Bluetooth control via BlueZ's `bluetoothctl`.
//!
//! Bluetooth is *optional* on this fleet: d3180 ships the hardware (`hci0`)
//! but runs a headless kiosk where `bluetoothd` is disabled, so a raw
//! `bluetoothctl` call would just block forever waiting for the daemon. Every
//! command here therefore (1) checks for a running daemon first and (2) runs
//! `bluetoothctl` under a hard timeout, *killing and reaping* the child when
//! it expires.
//!
//! The kill is the important part. `tokio::time::timeout` only drops the
//! future that is waiting for the child; with the old `spawn_blocking`
//! implementation the `bluetoothctl` process itself kept running and kept its
//! system-bus connection open. With a settings panel polling every six
//! seconds and no daemon, that leaked 242 processes and exhausted the per-UID
//! D-Bus connection limit, which in turn broke NetworkManager and systemctl.
//! We now spawn with `kill_on_drop(true)` and additionally `kill().await` /
//! `wait().await` on timeout so the process is always reaped.
//!
//! `bluetoothctl` talks to the system dbus over the per-user runtime socket, so
//! the child process inherits edex's environment (`XDG_RUNTIME_DIR`, `HOME`).
//! We deliberately never call `.env_clear()`.

use log::warn;
use serde::Serialize;
use serde_json;
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::command;
use tokio::io::AsyncReadExt;

/// How long to wait for a `bluetoothctl` round-trip before killing it. The
/// daemon normally answers in milliseconds; this only ever trips when no
/// daemon is listening (in which case the reply is treated as "unavailable").
const BT_TIMEOUT: Duration = Duration::from_secs(4);

/// Only one `bluetoothctl` may run at a time. Without this, a slow daemon plus
/// rapid button presses could still pile up processes even with per-call
/// timeouts; serializing keeps the system bus connection count bounded.
static BT_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// The overall availability of the Bluetooth stack, independent of power state.
///
/// Serialized as kebab-case: `"no-daemon"` / `"no-hardware"`. We use explicit
/// per-variant renames instead of `#[serde(rename_all = "kebab-case")]` on
/// purpose: serde inserts a `-` for *both* the underscore *and* the following
/// uppercase letter, so `No_Daemon` would become `"no--daemon"` (double dash)
/// and never match the frontend's `"no-daemon"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[allow(non_camel_case_types)]
pub enum BluetoothAvailability {
    /// `bluetoothd` is running and at least one adapter (`hci*`) exists.
    #[serde(rename = "available")]
    Available,
    /// No `bluetoothd` process (adapter may still be present but unusable).
    #[serde(rename = "no-daemon")]
    No_Daemon,
    /// No `bluetoothd` process *and* no adapter hardware.
    #[serde(rename = "no-hardware")]
    No_Hardware,
}

/// A single Bluetooth device as reported by `bluetoothctl devices`.
#[derive(Debug, Clone, Serialize)]
pub struct BluetoothDevice {
    pub address: String,
    pub name: String,
    pub connected: bool,
    pub paired: bool,
}

/// The state the settings UI needs to render a minimal Bluetooth panel.
#[derive(Debug, Clone, Serialize)]
pub struct BluetoothState {
    pub available: BluetoothAvailability,
    pub powered: bool,
    pub discoverable: bool,
    pub devices: Vec<BluetoothDevice>,
}

/// Is a BlueZ daemon actually up? We check the process list (fast, no dbus).
/// `pgrep` is short-lived and cannot hang on D-Bus, so the std `Command` is
/// fine here.
fn daemon_running() -> bool {
    Command::new("pgrep")
        .arg("bluetoothd")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// True when at least one `hci*` adapter exists under `/sys/class/bluetooth`.
fn has_adapter() -> bool {
    std::fs::read_dir("/sys/class/bluetooth")
        .ok()
        .and_then(|entries| {
            Some(
                entries
                    .into_iter()
                    .flatten()
                    .map(|entry| entry.file_name().to_string_lossy().into_owned())
                    .any(|name| name.starts_with("hci")),
            )
        })
        .unwrap_or(false)
}

/// The overall availability of the stack, regardless of power/discoverable.
fn availability() -> BluetoothAvailability {
    if daemon_running() {
        BluetoothAvailability::Available
    } else if has_adapter() {
        BluetoothAvailability::No_Daemon
    } else {
        BluetoothAvailability::No_Hardware
    }
}

/// Run `bluetoothctl` with a hard timeout, returning trimmed stdout on
/// success. An empty string means "no usable answer" (daemon down, timeout,
/// or error).
///
/// The child is killed and reaped on timeout — dropping the wait future alone
/// is what leaked processes before. `kill_on_drop` is a second line of
/// defence in case this future is itself cancelled (window closed, reload).
async fn run(args: &[&str]) -> String {
    let _guard = BT_LOCK.lock().await;

    let mut child = match tokio::process::Command::new("bluetoothctl")
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            warn!("failed to spawn bluetoothctl {args:?}: {e}");
            return String::new();
        }
    };

    // Take the pipe before waiting so we can drain it after the process exits.
    let mut stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => return String::new(),
    };

    let status = match tokio::time::timeout(BT_TIMEOUT, child.wait()).await {
        Ok(Ok(status)) => status,
        Ok(Err(e)) => {
            warn!("failed to wait for bluetoothctl {args:?}: {e}");
            return String::new();
        }
        Err(_) => {
            warn!(
                "bluetoothctl {args:?} timed out after {:?}; killing child {}",
                BT_TIMEOUT,
                child.id().unwrap_or_default()
            );
            let _ = child.kill().await;
            let _ = child.wait().await;
            return String::new();
        }
    };

    if !status.success() {
        return String::new();
    }

    let mut out = String::new();
    if let Err(e) = stdout.read_to_string(&mut out).await {
        warn!("failed to read bluetoothctl output: {e}");
        return String::new();
    }
    out.trim().to_string()
}

/// Parse a `Field: yes` line from `bluetoothctl show`.
///
/// The previous implementation compared the *whole line* to the field name,
/// so `Powered: yes` never matched `Powered`. Split on the colon and compare
/// only the key.
fn field(state: &str, name: &str) -> bool {
    state
        .lines()
        .map(str::trim)
        .find_map(|line| {
            let (key, value) = line.split_once(':')?;
            if key.trim().eq_ignore_ascii_case(name) {
                Some(value.trim().eq_ignore_ascii_case("yes"))
            } else {
                None
            }
        })
        .unwrap_or(false)
}

/// Parse `bluetoothctl devices` output into device entries.
///
/// Each line is `Device <Address> <Name>` and the connected device is tagged
/// with a trailing `>` marker (`bluetoothctl devices Connected`). `connected`
/// reflects whether this listing was the connected-only query.
fn parse_devices(out: &str, connected_only: bool) -> Vec<BluetoothDevice> {
    let mut devices = Vec::new();
    for line in out.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Strip the trailing '>' marker used by `bluetoothctl` to flag the
        // connected device, then the leading `Device ` keyword. Forgetting the
        // keyword made the old parser treat "Device" as the MAC address, so
        // the settings panel always said "No devices".
        let marker = line.ends_with('>');
        let line = line.trim_end_matches('>').trim();
        let line = line.strip_prefix("Device ").unwrap_or(line).trim_start();
        let parts: Vec<&str> = line.splitn(2, char::is_whitespace).collect();
        if parts.len() < 2 {
            continue;
        }
        let address = parts[0].trim().to_string();
        let name = parts[1].trim().to_string();
        if address.contains(':') && name.len() > 1 {
            devices.push(BluetoothDevice {
                address,
                name,
                connected: marker || connected_only,
                paired: true,
            });
        }
    }
    devices
}

/// Fetch the full Bluetooth state for the settings panel. Safe to call on a
/// short timer — every sub-call is daemon-guarded and time-limited.
#[command]
pub async fn bluetooth_state() -> BluetoothState {
    let available = availability();
    let js = serde_json::to_string(&available).unwrap_or_default();
    eprintln!("DBG BT serialized={js} daemon={:?} adapter={:?}", daemon_running(), has_adapter());
    let state = if available != BluetoothAvailability::Available {
        BluetoothState {
            available,
            powered: false,
            discoverable: false,
            devices: Vec::new(),
        }
    } else {
        let show = run(&["show"]).await;
        let powered = field(&show, "Powered");
        let discoverable = field(&show, "Discoverable");

        // Prefer the connected-device listing (stable, no prompts); fall back to a
        // plain device scan when it returns nothing.
        let devices = parse_devices(&run(&["devices", "Connected"]).await, true);
        let devices = if devices.is_empty() {
            parse_devices(&run(&["devices"]).await, false)
        } else {
            devices
        };

        BluetoothState {
            available: BluetoothAvailability::Available,
            powered,
            discoverable,
            devices,
        }
    };
    let _ = std::fs::write(
        "/tmp/bt_state.json",
        &format!("{}\n", serde_json::to_string(&state).unwrap_or_default()),
    );
    eprintln!("DBG BT full_state={}", serde_json::to_string(&state).unwrap_or_default());
    state
}

/// Turn Bluetooth power on/off. Mirrors the `bluetoothctl power` command.
#[command]
pub async fn bluetooth_set_powered(power_on: bool) {
    if !daemon_running() {
        warn!("ignoring bluetooth power change: bluetoothd is not running");
        return;
    }
    let _ = run(&["power", if power_on { "on" } else { "off" }]).await;
}

/// Toggle discoverability (visibility to other devices).
#[command]
pub async fn bluetooth_set_discoverable(on: bool) {
    if !daemon_running() {
        warn!("ignoring discoverable change: bluetoothd is not running");
        return;
    }
    let _ = run(&["discoverable", if on { "on" } else { "off" }]).await;
}

/// Pair and connect to a device by its MAC address. Best-effort: the various
/// interactive sub-commands may return prompts that we simply ignore.
#[command]
pub async fn bluetooth_connect(address: String) {
    if !daemon_running() {
        warn!("ignoring bluetooth connect: bluetoothd is not running");
        return;
    }
    let addr = address.trim().to_string();
    if addr.is_empty() || !addr.contains(':') {
        return;
    }
    let _ = run(&["pair", &addr]).await;
    let _ = run(&["connect", &addr]).await;
}

/// Disconnect and unpair a device.
#[command]
pub async fn bluetooth_disconnect(address: String) {
    if !daemon_running() {
        warn!("ignoring bluetooth disconnect: bluetoothd is not running");
        return;
    }
    let addr = address.trim().to_string();
    if addr.is_empty() || !addr.contains(':') {
        return;
    }
    let _ = run(&["disconnect", &addr]).await;
    let _ = run(&["unpair", &addr]).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_show_fields() {
        let show = "Controller 00:11:22:33:44:55 (public)\n\
                    \tPowered: yes\n\
                    \tDiscoverable: no\n\
                    \tDiscovering: no\n";
        assert!(field(show, "Powered"));
        assert!(!field(show, "Discoverable"));
        assert!(!field(show, "Discovering"));
        assert!(!field(show, "Missing"));
    }

    #[test]
    fn field_is_case_insensitive_and_requires_yes() {
        let show = "POWERED: YES\ndiscoverable:  yes  \nPairable: no\n";
        assert!(field(show, "powered"));
        assert!(field(show, "Discoverable"));
        assert!(!field(show, "Pairable"));
    }

    #[test]
    fn parses_device_list() {
        let out = "Device 00:11:22:33:44:55 Phone\n\
                   Device AA:BB:CC:DD:EE:FF Keyboard >\n\
                   garbage line\n\
                   Device 11:22:33:44:55:66\n";
        let devices = parse_devices(out, false);
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].address, "00:11:22:33:44:55");
        assert_eq!(devices[0].name, "Phone");
        assert!(!devices[0].connected);
        assert_eq!(devices[1].name, "Keyboard");
        assert!(devices[1].connected);
        assert!(devices[1].paired);
    }

    #[test]
    fn connected_listing_marks_every_entry_connected() {
        let devices = parse_devices("Device 00:11:22:33:44:55 Phone\n", true);
        assert_eq!(devices.len(), 1);
        assert!(devices[0].connected);
    }
}
