//! Audio volume / mute control via PulseAudio's `pactl`.
//!
//! These are one-shot, user-initiated commands (set volume, set mute) plus a
//! light read for the current state so the settings UI can show it.
//!
//! `pactl` talks to the PulseAudio server over the per-user runtime socket
//! (`$XDG_RUNTIME_DIR/1000/pulse/native`). The child process therefore inherits
//! edex's environment, which already carries `XDG_RUNTIME_DIR` and `HOME`. We
//! deliberately never call `.env_clear()` here — stripping those vars is what
//! produces `pa_context_connect() failed: Connection refused` on headless /
//! kiosk sessions like d3180.

use serde::Serialize;
use std::process::Command;
use tauri::command;

/// Discover the active default sink once per call. Querying dynamically keeps
/// things working when the user plugs in headphones or a different output.
fn default_sink() -> String {
    let sink = Command::new("pactl")
        .arg("get-default-sink")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    // Hard fallback so we never silently do nothing.
    sink.unwrap_or_else(|| "default".to_string())
}

/// Run a pactl subcommand and return trimmed stdout; empty on failure.
fn run_pactl(args: &[&str]) -> String {
    Command::new("pactl")
        .args(args)
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

/// Parse the percentage out of a `pactl get-sink-volume` line such as:
///   `Volume: front-left: 45201 /  69% / -9.68 dB, front-right: ...`
/// The canonical field is `/<spaces>NN%`; we take the first such field.
fn parse_percent(out: &str) -> u8 {
    let bytes = out.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'/' {
            let mut j = i + 1;
            while j < bytes.len() && bytes[j] == b' ' {
                j += 1;
            }
            let start = j;
            while j < bytes.len() && bytes[j].is_ascii_digit() {
                j += 1;
            }
            if j > start && j < bytes.len() && bytes[j] == b'%' {
                return out[start..j].parse::<u8>().unwrap_or(0).min(150);
            }
        }
        i += 1;
    }
    0
}

fn parse_muted(out: &str) -> bool {
    out.to_lowercase().contains("mute: yes")
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioState {
    pub volume: u8,
    pub muted: bool,
}

/// Fetch the current volume (0-150; 150 allows software amplification) and mute
/// state. Safe to call on a short timer — a single pactl round-trip each.
#[command]
pub fn audio_state() -> AudioState {
    let sink = default_sink();
    let volume = parse_percent(&run_pactl(&["get-sink-volume", &sink]));
    let muted = parse_muted(&run_pactl(&["get-sink-mute", &sink]));
    AudioState { volume, muted }
}

/// Set the absolute sink volume (0-150).
#[command]
pub fn audio_set_volume(volume: u8) {
    let sink = default_sink();
    let _ = run_pactl(&["set-sink-volume", &sink, &format!("{}%", volume.clamp(0, 150))]);
}

/// Set the mute state directly. The frontend tracks its own mute toggle and
/// calls this with the desired state, avoiding an extra round-trip.
#[command]
pub fn audio_set_mute(muted: bool) {
    let sink = default_sink();
    let value = if muted { "yes" } else { "no" };
    let _ = run_pactl(&["set-sink-mute", &sink, value]);
}
