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
//!
//! Every call is time-limited and kills its child on timeout. A wedged audio
//! server must never be able to hang a Tauri command or leave `pactl`
//! processes behind (the same failure mode that `bluetoothctl` had).

use log::warn;
use serde::Serialize;
use std::process::Stdio;
use std::time::Duration;
use tauri::command;
use tokio::io::AsyncReadExt;

/// `pactl` normally answers instantly; 2s is already pathological.
const PACTL_TIMEOUT: Duration = Duration::from_secs(2);

static PACTL_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Run `pactl` with a hard timeout, returning trimmed stdout on success.
/// Empty string means "no usable answer"; the caller degrades to defaults.
async fn run_pactl(args: &[&str]) -> String {
    let _guard = PACTL_LOCK.lock().await;

    let mut child = match tokio::process::Command::new("pactl")
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            warn!("failed to spawn pactl {args:?}: {e}");
            return String::new();
        }
    };

    let mut stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => return String::new(),
    };

    let status = match tokio::time::timeout(PACTL_TIMEOUT, child.wait()).await {
        Ok(Ok(status)) => status,
        Ok(Err(e)) => {
            warn!("failed to wait for pactl {args:?}: {e}");
            return String::new();
        }
        Err(_) => {
            warn!(
                "pactl {args:?} timed out after {:?}; killing child {}",
                PACTL_TIMEOUT,
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
        warn!("failed to read pactl output: {e}");
        return String::new();
    }
    out.trim().to_string()
}

/// Discover the active default sink once per call. Querying dynamically keeps
/// things working when the user plugs in headphones or a different output.
async fn default_sink() -> String {
    let sink = run_pactl(&["get-default-sink"]).await;
    if sink.is_empty() {
        // Hard fallback so we never silently do nothing.
        "default".to_string()
    } else {
        sink
    }
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
                // Percentages above 255 (software amplification) must clamp,
                // not overflow u8 and fall back to 0.
                return out[start..j].parse::<u32>().unwrap_or(0).min(150) as u8;
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
/// state. Safe to call on a short timer — two bounded pactl round-trips.
#[command]
pub async fn audio_state() -> AudioState {
    let sink = default_sink().await;
    let volume = parse_percent(&run_pactl(&["get-sink-volume", &sink]).await);
    let muted = parse_muted(&run_pactl(&["get-sink-mute", &sink]).await);
    AudioState { volume, muted }
}

/// Set the absolute sink volume (0-150).
#[command]
pub async fn audio_set_volume(volume: u8) {
    let sink = default_sink().await;
    let _ = run_pactl(&[
        "set-sink-volume",
        &sink,
        &format!("{}%", volume.clamp(0, 150)),
    ])
    .await;
}

/// Set the mute state directly. The frontend tracks its own mute toggle and
/// calls this with the desired state, avoiding an extra round-trip.
#[command]
pub async fn audio_set_mute(muted: bool) {
    let sink = default_sink().await;
    let value = if muted { "yes" } else { "no" };
    let _ = run_pactl(&["set-sink-mute", &sink, value]).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_first_percentage() {
        let out = "Volume: front-left: 45201 /  69% / -9.68 dB, front-right: 45201 /  69% / -9.68 dB";
        assert_eq!(parse_percent(out), 69);
    }

    #[test]
    fn parses_amplified_percentage_and_clamps() {
        assert_eq!(parse_percent("Volume: mono: 98304 / 150% / 0.00 dB"), 150);
        assert_eq!(parse_percent("Volume: mono: 999999 / 999% / 0.00 dB"), 150);
    }

    #[test]
    fn missing_percentage_is_zero() {
        assert_eq!(parse_percent(""), 0);
        assert_eq!(parse_percent("Volume: front-left: 0 / --"), 0);
    }

    #[test]
    fn parses_mute() {
        assert!(parse_muted("Mute: yes\n"));
        assert!(!parse_muted("Mute: no\n"));
    }
}
