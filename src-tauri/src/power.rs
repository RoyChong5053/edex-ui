//! Power / presence management.
//!
//! eDEX-UI is a full-screen, always-animating dashboard. On a weak machine it
//! must not keep rendering while the user is doing something else or while the
//! screen is off. This module owns a tiny state machine:
//!
//!   ACTIVE -> YIELD  (window lost focus, another app is in front)
//!   ACTIVE -> SLEEP  (no input for `idle_timeout_secs`)
//!   YIELD  -> ACTIVE (window focused again, user is not idle)
//!   SLEEP  -> ACTIVE (input + focused) / YIELD (input + not focused)
//!
//! The frontend listens for the `power` event and stops its canvas renderers;
//! the system monitor blocks on `wait_active()` so sysinfo does not burn CPU.
//! The edex main process is deliberately *not* stopped, so it can still see
//! focus changes, answer the control socket, and wake itself up.

use log::{error, info};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const SOCKET_PATH: &str = "/tmp/edex-1000.sock";

/// How long the frontend may go without a heartbeat while ACTIVE before we
/// assume WebKit did not survive a long `SIGSTOP` and reload it. The frontend
/// beats every two seconds; this is generous enough to survive GC pauses and
/// a loaded CPU without reloading a healthy UI.
const HEARTBEAT_STALE_MS: u64 = 10_000;

/// Minimum gap between watchdog reloads so a genuinely broken page cannot
/// cause a reload loop.
const RELOAD_COOLDOWN_MS: u64 = 60_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PowerState {
    Active,
    Yield,
    Sleep,
}

#[derive(Clone, Serialize)]
struct PowerPayload {
    state: PowerState,
    showcase: bool,
}

pub struct PowerManager {
    app: AppHandle,
    state: Mutex<PowerState>,
    state_cv: Condvar,
    focused: AtomicBool,
    manual_hold: AtomicBool,
    last_pty_activity_ms: AtomicU64,
    last_transition_ms: AtomicU64,
    hard_frozen: AtomicBool,
    web_pids: Mutex<Vec<u32>>,
    pty_buffers: Mutex<HashMap<String, Vec<u8>>>,
    showcase: AtomicBool,
    // Volatile so the settings UI can retune the timeout at runtime without
    // racing the idle loop that reads it.
    idle_timeout_ms: AtomicU64,
    // Liveness of the webview. Updated by a 2s `ui_heartbeat` invocation from
    // the frontend; the watchdog reloads the page if it stops while active.
    last_heartbeat_ms: AtomicU64,
    ui_seen: AtomicBool,
    last_reload_ms: AtomicU64,
    reload_count: AtomicU64,
}

impl PowerManager {
    pub fn new(app: AppHandle, idle_timeout_secs: u64) -> Arc<Self> {
        Arc::new(Self {
            app,
            state: Mutex::new(PowerState::Active),
            state_cv: Condvar::new(),
            focused: AtomicBool::new(true),
            manual_hold: AtomicBool::new(false),
            last_pty_activity_ms: AtomicU64::new(0),
            last_transition_ms: AtomicU64::new(now_ms()),
            hard_frozen: AtomicBool::new(false),
            web_pids: Mutex::new(Vec::new()),
            pty_buffers: Mutex::new(HashMap::new()),
            showcase: AtomicBool::new(false),
            idle_timeout_ms: AtomicU64::new(idle_timeout_secs.saturating_mul(1000)),
            last_heartbeat_ms: AtomicU64::new(now_ms()),
            ui_seen: AtomicBool::new(false),
            last_reload_ms: AtomicU64::new(0),
            reload_count: AtomicU64::new(0),
        })
    }

    /// Retune the idle-freeze timeout at runtime. Called from the settings UI.
    /// `0` disables auto-freeze entirely. Values are clamped to at most one
    /// hour so a stray input can't leave the box rendering indefinitely.
    pub fn set_idle_timeout(&self, idle_timeout_secs: u64) {
        let secs = idle_timeout_secs.min(3600);
        self.idle_timeout_ms.store(secs.saturating_mul(1000), Ordering::Relaxed);
        if secs == 0 {
            info!("idle-freeze disabled (auto-freeze off)");
        } else {
            info!("idle-freeze timeout -> {secs}s");
        }
    }

    pub fn start(self: &Arc<Self>) {
        let ctl = self.clone();
        if let Err(e) = thread::Builder::new()
            .name("edex-power-ctl".into())
            .spawn(move || ctl.serve_socket())
        {
            error!("failed to start power control socket: {e}");
        }

        let idle = self.clone();
        if let Err(e) = thread::Builder::new()
            .name("edex-power-idle".into())
            .spawn(move || idle.idle_loop())
        {
            error!("failed to start idle watcher: {e}");
        }

        let freeze = self.clone();
        if let Err(e) = thread::Builder::new()
            .name("edex-power-freeze".into())
            .spawn(move || freeze.hard_freeze_loop())
        {
            error!("failed to start hard freeze watcher: {e}");
        }

        let watchdog = self.clone();
        if let Err(e) = thread::Builder::new()
            .name("edex-ui-watchdog".into())
            .spawn(move || watchdog.ui_watchdog_loop())
        {
            error!("failed to start UI watchdog: {e}");
        }
    }

    pub fn state(&self) -> PowerState {
        *self.state.lock().unwrap()
    }

    pub fn is_active(&self) -> bool {
        self.state() == PowerState::Active
    }

    /// Toggle between an explicit freeze and waking up. This is the backend
    /// behind the "Freeze / Wake" keyboard shortcut: when already active it
    /// freezes immediately (surviving focus changes via the manual-hold flag);
    /// otherwise it wakes, treating the keypress like a fresh input event.
    pub fn toggle(&self) {
        if self.is_active() {
            self.manual_freeze();
        } else {
            self.focused.store(true, Ordering::Relaxed);
            self.activate("key-toggle");
        }
    }

    pub fn note_pty_activity(&self) {
        self.last_pty_activity_ms.store(now_ms(), Ordering::Relaxed);
    }

    /// Liveness beat from the frontend. Called every two seconds by a timer
    /// that only runs while the page is executing; if it stops, the webview is
    /// either frozen or wedged and the watchdog may recover it.
    pub fn heartbeat(&self) {
        self.last_heartbeat_ms.store(now_ms(), Ordering::Relaxed);
        self.ui_seen.store(true, Ordering::Relaxed);
    }

    pub fn heartbeat_age_ms(&self) -> u64 {
        now_ms().saturating_sub(self.last_heartbeat_ms.load(Ordering::Relaxed))
    }

    /// Reload the main webview. Used by the watchdog and `edex-ctl reload`.
    ///
    /// The PTYs are owned by the Rust process, so reloading does not kill the
    /// running shells — but the tab list lives in the frontend, so this is a
    /// recovery path, not a transparent one: the reloaded UI starts a fresh
    /// terminal and the old sessions are left running in the background until
    /// terminal reattach lands (M2). A working cockpit beats a wedged one.
    pub fn reload_ui(&self, reason: &str) -> bool {
        let Some(window) = self.app.get_webview_window("main") else {
            error!("cannot reload UI ({reason}): main window is gone");
            return false;
        };
        self.last_reload_ms.store(now_ms(), Ordering::Relaxed);
        self.reload_count.fetch_add(1, Ordering::Relaxed);
        // Give the fresh page a heartbeat grace period instead of immediately
        // tripping the stale check again before its first beat.
        self.last_heartbeat_ms.store(now_ms(), Ordering::Relaxed);
        match window.reload() {
            Ok(()) => {
                info!("reloading UI ({reason})");
                true
            }
            Err(e) => {
                error!("failed to reload UI ({reason}): {e}");
                false
            }
        }
    }

    fn ui_watchdog_loop(&self) {
        loop {
            thread::sleep(Duration::from_secs(2));

            // Only a page that is supposed to be running can be wedged. While
            // SLEEP/YIELD the whole web process is SIGSTOPped (or idle), so a
            // stale heartbeat is expected.
            if self.state() != PowerState::Active || self.is_hard_frozen() {
                continue;
            }
            // Never reload before the first heartbeat: a slow cold start must
            // not be mistaken for a hang.
            if !self.ui_seen.load(Ordering::Relaxed) {
                continue;
            }

            let age = self.heartbeat_age_ms();
            if age <= HEARTBEAT_STALE_MS {
                continue;
            }

            let since_reload =
                now_ms().saturating_sub(self.last_reload_ms.load(Ordering::Relaxed));
            if since_reload < RELOAD_COOLDOWN_MS {
                continue;
            }

            error!(
                "UI heartbeat stale for {age}ms while active; reloading webview to recover"
            );
            self.reload_ui("stale-heartbeat");
        }
    }

    pub fn set_focused(&self, focused: bool) {
        self.focused.store(focused, Ordering::Relaxed);
        if focused {
            if self.manual_hold.load(Ordering::Relaxed) {
                return;
            }
            let timeout_ms = self.idle_timeout_ms.load(Ordering::Relaxed);
            // `0` means Never: focusing must always wake, regardless of how
            // long the machine has been idle.
            if timeout_ms == 0 {
                self.activate("focus");
                return;
            }
            let idle = read_idle_ms().unwrap_or(0);
            if idle < timeout_ms {
                self.activate("focus");
            } else if self.state() == PowerState::Active {
                // The window got focus, but the user has not touched the
                // machine for the whole timeout. Keep sleeping until input.
                self.sleep("focus-while-idle");
            }
        } else if self.state() == PowerState::Active {
            self.yield_now("blur");
        }
    }

    pub fn activate(&self, reason: &str) {
        self.manual_hold.store(false, Ordering::Relaxed);
        self.set_state(PowerState::Active, reason);
    }

    /// Manual freeze from `edex-ctl freeze`; survives focus changes until an
    /// explicit `thaw`.
    pub fn manual_freeze(&self) {
        self.manual_hold.store(true, Ordering::Relaxed);
        self.yield_now("manual");
    }

    pub fn yield_now(&self, reason: &str) {
        self.set_state(PowerState::Yield, reason);
    }

    pub fn sleep(&self, reason: &str) {
        self.set_state(PowerState::Sleep, reason);
    }

    pub fn set_showcase(&self, on: bool) {
        self.showcase.store(on, Ordering::Relaxed);
        if let Err(e) = self.app.emit("showcase", on) {
            error!("failed to emit showcase event: {e}");
        }
    }

    /// Block the system-monitor thread until the UI is active again.
    pub fn wait_active(&self) {
        let mut state = self.state.lock().unwrap();
        while *state != PowerState::Active {
            state = self.state_cv.wait(state).unwrap();
        }
    }

    pub fn is_hard_frozen(&self) -> bool {
        self.hard_frozen.load(Ordering::Relaxed)
    }

    /// While the WebKit process is SIGSTOPped, terminal output cannot be
    /// rendered. Keep a bounded per-session buffer and replay it on thaw
    /// instead of letting Tauri's event queue grow without limit.
    pub fn buffer_pty(&self, id: &str, data: &[u8]) {
        let mut buffers = self.pty_buffers.lock().unwrap();
        let buffer = buffers.entry(id.to_owned()).or_default();
        buffer.extend_from_slice(data);
        const LIMIT: usize = 256 * 1024;
        if buffer.len() > LIMIT {
            let drain = buffer.len() - LIMIT;
            buffer.drain(..drain);
        }
    }

    fn hard_freeze_loop(&self) {
        let mut last_attempt = 0u64;
        loop {
            thread::sleep(Duration::from_millis(100));
            if self.state() == PowerState::Active {
                if self.is_hard_frozen() {
                    self.hard_thaw();
                }
                continue;
            }

            // Give the frontend a moment to play the yield/collapse
            // transition before WebKit stops drawing.
            let elapsed = now_ms().saturating_sub(self.last_transition_ms.load(Ordering::Relaxed));
            if elapsed < 250 || self.is_hard_frozen() || !self.can_hard_freeze() {
                continue;
            }

            // Scanning /proc is cheap but not free; retry at most once a
            // second if WebKit has not spawned yet.
            let now = now_ms();
            if now.saturating_sub(last_attempt) < 1000 {
                continue;
            }
            last_attempt = now;
            self.hard_freeze();
        }
    }

    fn can_hard_freeze(&self) -> bool {
        let last = self.last_pty_activity_ms.load(Ordering::Relaxed);
        last == 0 || now_ms().saturating_sub(last) > 2000
    }

    fn hard_freeze(&self) {
        let pids = find_web_processes();
        if pids.is_empty() {
            return;
        }
        for pid in &pids {
            unsafe {
                libc::kill(*pid as i32, libc::SIGSTOP);
            }
        }
        *self.web_pids.lock().unwrap() = pids.clone();
        self.hard_frozen.store(true, Ordering::Relaxed);
        info!("hard-froze WebKit processes: {pids:?}");
    }

    fn hard_thaw(&self) {
        if !self.hard_frozen.swap(false, Ordering::Relaxed) {
            return;
        }

        let pids = std::mem::take(&mut *self.web_pids.lock().unwrap());
        for pid in &pids {
            if is_webkit_process(*pid) {
                unsafe {
                    libc::kill(*pid as i32, libc::SIGCONT);
                }
            }
        }
        info!("thawed WebKit processes: {pids:?}");

        let buffers: Vec<(String, Vec<u8>)> = {
            let mut map = self.pty_buffers.lock().unwrap();
            map.drain().collect()
        };
        for (id, data) in buffers {
            if let Err(e) = self.app.emit(&format!("data-{id}"), data) {
                error!("failed to replay buffered terminal output: {e}");
            }
        }
    }

    fn set_state(&self, next: PowerState, reason: &str) {
        {
            let mut state = self.state.lock().unwrap();
            if *state == next {
                return;
            }
            *state = next;
            self.state_cv.notify_all();
        }
        self.last_transition_ms.store(now_ms(), Ordering::Relaxed);

        // Resume WebKit before telling the frontend to wake up. Any terminal
        // output buffered while frozen is replayed at the same time.
        if next == PowerState::Active {
            self.hard_thaw();
        }

        info!("power state -> {next:?} ({reason})");
        let payload = PowerPayload {
            state: next,
            showcase: self.showcase.load(Ordering::Relaxed),
        };
        if let Err(e) = self.app.emit("power", payload) {
            error!("failed to emit power event: {e}");
        }

        match next {
            PowerState::Active => {
                // The X server usually wakes on input by itself; this is
                // harmless when the display is already on and guarantees
                // that a manual `edex-ctl thaw` lights the panel.
                xset(&["dpms", "force", "on"]);
            }
            PowerState::Sleep => {
                xset(&["dpms", "force", "off"]);
            }
            PowerState::Yield => {}
        }
    }

    fn idle_loop(&self) {
        loop {
            thread::sleep(Duration::from_secs(5));
            let Some(idle) = read_idle_ms() else {
                continue;
            };
            let focused = self.focused.load(Ordering::Relaxed);
            let state = self.state();

            let hold = self.manual_hold.load(Ordering::Relaxed);
            let timeout_ms = self.idle_timeout_ms.load(Ordering::Relaxed);

            // `0` = Never. The old code compared `idle >= 0`, which is always
            // true, so "Never" still slept after the 60s grace period.
            if timeout_ms > 0 && idle >= timeout_ms {
                // Give a freshly summoned cockpit a minute to be looked at
                // before the idle timeout can put it back to sleep.
                let since_transition =
                    now_ms().saturating_sub(self.last_transition_ms.load(Ordering::Relaxed));
                if since_transition < 60_000 {
                    continue;
                }
                if state != PowerState::Sleep {
                    self.sleep("idle-timeout");
                }
                continue;
            }

            // A manual `edex-ctl freeze` must survive focus changes; only an
            // explicit `thaw` (or `edex-start`) clears it.
            if hold && state != PowerState::Active {
                continue;
            }

            match state {
                PowerState::Sleep => {
                    if focused {
                        self.activate("input-while-focused");
                    } else {
                        self.yield_now("input-while-unfocused");
                    }
                }
                PowerState::Yield if focused => self.activate("focus-restored"),
                PowerState::Active if !focused => self.yield_now("focus-lost"),
                _ => {}
            }
        }
    }

    fn serve_socket(&self) {
        let _ = std::fs::remove_file(SOCKET_PATH);
        let listener = match UnixListener::bind(SOCKET_PATH) {
            Ok(listener) => listener,
            Err(e) => {
                error!("failed to bind {SOCKET_PATH}: {e}");
                return;
            }
        };
        let _ = std::fs::set_permissions(SOCKET_PATH, std::fs::Permissions::from_mode(0o600));
        info!("power control socket ready at {SOCKET_PATH}");

        for stream in listener.incoming() {
            match stream {
                Ok(stream) => self.handle_client(stream),
                Err(e) => error!("power control accept failed: {e}"),
            }
        }
    }

    fn handle_client(&self, mut stream: UnixStream) {
        let reader = match stream.try_clone() {
            Ok(clone) => BufReader::new(clone),
            Err(e) => {
                error!("power control clone failed: {e}");
                return;
            }
        };

        for line in reader.lines() {
            let Ok(line) = line else { break };
            let command = line.trim();
            if command.is_empty() {
                continue;
            }

            let response = match command {
                "status" => self.status_json(),
                "freeze" | "yield" => {
                    self.manual_freeze();
                    self.status_json()
                }
                "thaw" | "active" | "wake" => {
                    self.focused.store(true, Ordering::Relaxed);
                    self.activate("ctl");
                    self.status_json()
                }
                "sleep" => {
                    self.manual_hold.store(true, Ordering::Relaxed);
                    self.sleep("ctl");
                    self.status_json()
                }
                "toggle" => {
                    if self.is_active() {
                        self.manual_freeze();
                    } else {
                        self.focused.store(true, Ordering::Relaxed);
                        self.activate("ctl");
                    }
                    self.status_json()
                }
                "showcase on" => {
                    self.set_showcase(true);
                    self.status_json()
                }
                "showcase off" => {
                    self.set_showcase(false);
                    self.status_json()
                }
                "showcase" => {
                    let on = !self.showcase.load(Ordering::Relaxed);
                    self.set_showcase(on);
                    self.status_json()
                }
                "reload" => {
                    self.reload_ui("ctl");
                    self.status_json()
                }
                _ if command.starts_with("theme ") => {
                    let theme = command.trim_start_matches("theme ").trim();
                    if let Err(e) = self.app.emit("theme", theme.to_string()) {
                        error!("failed to emit theme event: {e}");
                    }
                    self.status_json()
                }
                other => format!("{{\"error\":\"unknown command: {other}\"}}"),
            };

            if writeln!(stream, "{response}").is_err() {
                break;
            }
        }
    }

    fn status_json(&self) -> String {
        let pty_idle = {
            let last = self.last_pty_activity_ms.load(Ordering::Relaxed);
            if last == 0 {
                u64::MAX
            } else {
                now_ms().saturating_sub(last)
            }
        };
        serde_json::json!({
            "state": self.state(),
            "focused": self.focused.load(Ordering::Relaxed),
            "showcase": self.showcase.load(Ordering::Relaxed),
            "hard_frozen": self.is_hard_frozen(),
            "web_pids": self.web_pids.lock().unwrap().len(),
            "idle_ms": read_idle_ms(),
            "pty_idle_ms": pty_idle,
            "idle_timeout_ms": self.idle_timeout_ms.load(Ordering::Relaxed),
            "heartbeat_age_ms": self.heartbeat_age_ms(),
            "ui_seen": self.ui_seen.load(Ordering::Relaxed),
            "reload_count": self.reload_count.load(Ordering::Relaxed),
        })
        .to_string()
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_idle_ms() -> Option<u64> {
    let output = Command::new("xprintidle").output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()?
        .trim()
        .parse::<u64>()
        .ok()
}

fn xset(args: &[&str]) {
    let _ = Command::new("xset").args(args).status();
}

fn is_webkit_process(pid: u32) -> bool {
    std::fs::read_to_string(format!("/proc/{pid}/comm"))
        .map(|name| name.trim_start().starts_with("WebKit"))
        .unwrap_or(false)
}

fn find_web_processes() -> Vec<u32> {
    let root = std::process::id();
    let mut pids = Vec::new();

    let Ok(entries) = std::fs::read_dir("/proc") else {
        return pids;
    };
    for entry in entries.flatten() {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|name| name.parse::<u32>().ok())
        else {
            continue;
        };
        if is_webkit_process(pid) && is_descendant(pid, root) {
            pids.push(pid);
        }
    }

    pids.sort_unstable();
    pids.dedup();
    pids
}

fn is_descendant(pid: u32, root: u32) -> bool {
    let mut current = pid;
    for _ in 0..16 {
        if current == root {
            return true;
        }
        match read_ppid(current) {
            Some(ppid) if ppid > 0 => current = ppid,
            _ => return false,
        }
    }
    false
}

fn read_ppid(pid: u32) -> Option<u32> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let rest = stat.rsplit_once(')')?.1;
    let mut fields = rest.split_whitespace();
    fields.next()?; // state
    fields.next()?.parse().ok()
}
