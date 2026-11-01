use crate::power::PowerManager;
use log::error;
use serde::Serialize;
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const TMUX_INTERVAL: Duration = Duration::from_secs(2);
const TMUX_FORMAT: &str =
    "#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_activity}";

#[derive(Debug, Clone, Serialize)]
struct TmuxSession {
    name: String,
    windows: u32,
    attached: bool,
    activity: i64,
}

#[derive(Debug, Clone, Serialize)]
struct TmuxStatus {
    available: bool,
    sessions: Vec<TmuxSession>,
}

pub struct TmuxMonitor {
    power: Arc<PowerManager>,
    app_handle: AppHandle,
}

impl TmuxMonitor {
    pub fn new(power: Arc<PowerManager>, app_handle: AppHandle) -> Self {
        Self { power, app_handle }
    }

    pub fn run(self) {
        loop {
            self.power.wait_active();

            let status = list_sessions();
            if let Err(e) = self.app_handle.emit("tmux", status) {
                error!("Failed to emit tmux status: {e}");
            }

            thread::sleep(TMUX_INTERVAL);
        }
    }
}

fn list_sessions() -> TmuxStatus {
    let output = match Command::new("tmux")
        .args(["list-sessions", "-F", TMUX_FORMAT])
        .output()
    {
        Ok(output) => output,
        Err(_) => {
            return TmuxStatus {
                available: false,
                sessions: Vec::new(),
            };
        }
    };

    if !output.status.success() {
        return TmuxStatus {
            available: false,
            sessions: Vec::new(),
        };
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut sessions: Vec<TmuxSession> = stdout
        .lines()
        .filter_map(|line| {
            let mut fields = line.splitn(4, '\t');
            let name = fields.next()?.to_string();
            let windows = fields.next()?.parse().unwrap_or(0);
            let attached = fields.next()? != "0";
            let activity = fields.next()?.parse().unwrap_or(0);

            Some(TmuxSession {
                name,
                windows,
                attached,
                activity,
            })
        })
        .collect();

    sessions.sort_by(|a, b| a.name.cmp(&b.name));

    TmuxStatus {
        available: true,
        sessions,
    }
}
