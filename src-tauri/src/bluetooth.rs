//! Bluetooth control via BlueZ's `bluetoothctl`.
//!
//! Bluetooth is *optional* on this fleet: d3180 ships the hardware (`hci0`)
//! but runs a headless kiosk where `bluetoothd` is disabled, so a raw
//! `bluetoothctl` call would just block forever waiting for the daemon. Every
//! command here therefore (1) checks for a running daemon first and (2) runs
//! `bluetoothctl` under a hard timeout so a missing daemon degrades to a clear
//! "unavailable" result instead of a hung process.
//!
//! `bluetoothctl` talks to the system dbus over the per-user runtime socket, so
//! the child process inherits edex's environment (`XDG_RUNTIME_DIR`, `HOME`).
//! We deliberately never call `.env_clear()`.

use serde::Serialize;
use std::process::Command;
use std::time::Duration;
use tauri::command;

/// How long to wait for a `bluetoothctl` round-trip before giving up. The
/// daemon normally answers in milliseconds; this only ever trips when no daemon
/// is listening (in which case the reply is treated as "unavailable").
const BT_TIMEOUT: Duration = Duration::from_secs(4);

/// The overall availability of the Bluetooth stack, independent of power state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum BluetoothAvailability {
    /// `bluetoothd` is running and at least one adapter (`hci*`) exists.
    Available,
    /// No `bluetoothd` process (adapter may still be present but unusable).
    NoDaemon,
    /// No `bluetoothd` process *and* no adapter hardware.
    NoHardware,
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
fn daemon_running() -> bool {
    Command::new("pgrep")
        .arg("bluetoothd")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// True when a BlueZ daemon is running *and* at least one `hci*` adapter exists.
fn has_adapter() -> bool {
    Command::new("ls")
        .arg("-d")
        .arg("/sys/class/bluetooth/hci*")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// The overall availability of the stack, regardless of power/discoverable.
fn availability() -> BluetoothAvailability {
    if !daemon_running() {
        if has_adapter() {
            BluetoothAvailability::NoDaemon
        } else {
            BluetoothAvailability::NoHardware
        }
    } else {
        BluetoothAvailability::Available
    }
}

/// Run `bluetoothctl` with a timeout, returning trimmed stdout on success.
/// An empty string means "no usable answer" (daemon down, timeout, or error).
///
/// The standard library `Command` has no `.timeout()`, so we run it on a
/// blocking thread and race that against `tokio::time::timeout`. A hang or
/// missing daemon therefore yields an empty string rather than a stuck call.
async fn run(args: &[&str]) -> String {
    let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let handle = tokio::task::spawn_blocking(move || {
        Command::new("bluetoothctl")
            .args(&args)
            .output()
    });

    let output: std::io::Result<std::process::Output> =
        match tokio::time::timeout(BT_TIMEOUT, handle).await {
            Ok(Ok(output)) => output,
            // timed out, handle dropped, or the thread panicked
            _ => return String::new(),
        };

    output
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

/// Parse a `Field: yes` line from `bluetoothctl show`.
fn field(state: &str, name: &str) -> bool {
    state
        .lines()
        .map(|l| l.trim())
        .find(|l| l.eq_ignore_ascii_case(name))
        .and_then(|l| l.split_once(':'))
        .map(|(_, v)| v.trim().eq_ignore_ascii_case("yes"))
        .unwrap_or(false)
}

/// Parse `bluetoothctl devices` output into device entries.
///
/// Each line is `  <Address> <Name>` and the connected device is tagged with a
/// trailing `>` marker (`bluetoothctl devices Connected`). `connected` reflects
/// whether this listing was the connected-only query.
fn parse_devices(out: &str, connected_only: bool) -> Vec<BluetoothDevice> {
    let mut devices = Vec::new();
    for line in out.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Strip the trailing '>' marker used by `bluetoothctl` to flag the
        // connected device, then split address from name.
        let marker = line.ends_with('>');
        let line = line.trim_end_matches('>').trim();
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
    if availability() == BluetoothAvailability::NoDaemon {
        return BluetoothState {
            available: BluetoothAvailability::NoDaemon,
            powered: false,
            discoverable: false,
            devices: Vec::new(),
        };
    }

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
}

/// Turn Bluetooth power on/off. Mirrors the `bluetoothctl power` command.
#[command]
pub async fn bluetooth_set_powered(power_on: bool) {
    let _ = run(&["power", if power_on { "on" } else { "off" }]).await;
}

/// Toggle discoverability (visibility to other devices).
#[command]
pub async fn bluetooth_set_discoverable(on: bool) {
    let _ = run(&["discoverable", if on { "on" } else { "off" }]).await;
}

/// Pair and connect to a device by its MAC address. Best-effort: the various
/// interactive sub-commands may return prompts that we simply ignore.
#[command]
pub async fn bluetooth_connect(address: String) {
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
    let addr = address.trim().to_string();
    if addr.is_empty() || !addr.contains(':') {
        return;
    }
    let _ = run(&["disconnect", &addr]).await;
    let _ = run(&["unpair", &addr]).await;
}
