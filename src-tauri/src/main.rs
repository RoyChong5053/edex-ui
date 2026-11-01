#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use log::{error, info, LevelFilter};
use sysinfo::System;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

use crate::cluster::ClusterMonitor;
use crate::event::main::EventProcessor;
use crate::power::PowerManager;
use crate::session::main::PtySessionManager;
use crate::sys::main::SystemMonitor;
use crate::tmux::TmuxMonitor;

mod audio;
mod bluetooth;
mod cluster;
mod event;
mod power;
mod session;
mod sys;
mod tmux;

#[tauri::command]
async fn kernel_version() -> Result<String, String> {
    System::kernel_version()
        .map(|v| v.chars().take_while(|&ch| ch != '-').collect::<String>())
        .ok_or_else(|| "Failed to get kernel version".to_string())
}

/// Toggle the power / idle-freeze state from the frontend. Backs the
/// "Freeze / Wake" keyboard shortcut so the user can instantly park the
/// always-animating webview (the biggest CPU lever on this Atom).
#[tauri::command]
async fn power_toggle(power: tauri::State<'_, std::sync::Arc<PowerManager>>) -> Result<(), String> {
    power.toggle();
    Ok(())
}

/// Retune the idle-freeze timeout from the settings UI. `0` disables
/// auto-freeze. This is the user-facing lever for the biggest CPU cost:
/// a shorter timeout parks the always-animating webview sooner.
#[tauri::command]
async fn power_set_idle_timeout(
    power: tauri::State<'_, std::sync::Arc<PowerManager>>,
    idle_timeout_secs: u64,
) -> Result<(), String> {
    power.set_idle_timeout(idle_timeout_secs);
    Ok(())
}

fn main() {
    let log_level = if cfg!(debug_assertions) {
        LevelFilter::Info
    } else {
        LevelFilter::Error
    };

    // Route panics through the log subsystem so fatal errors land in the
    // on-disk log file as well as stderr. The default panic hook only writes
    // to stderr, which is easy to miss for GUI apps where the user may have
    // no terminal attached. After logging, fall through to the default hook
    // so normal panic behavior (stack trace, eventual abort) is preserved.
    let default_panic_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload_as_str()
            .unwrap_or("<non-string panic payload>");
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "<unknown>".to_string());
        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("<unnamed>");
        error!("panic in thread '{thread_name}' at {location}: {message}");
        default_panic_hook(info);
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .level(log_level)
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .invoke_handler(tauri::generate_handler![
            kernel_version,
            audio::audio_state,
            audio::audio_set_volume,
            audio::audio_set_mute,
            power_toggle,
            power_set_idle_timeout,
            bluetooth::bluetooth_state,
            bluetooth::bluetooth_set_powered,
            bluetooth::bluetooth_set_discoverable,
            bluetooth::bluetooth_connect,
            bluetooth::bluetooth_disconnect
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                if let Some(power) = window
                    .app_handle()
                    .try_state::<std::sync::Arc<PowerManager>>()
                {
                    power.set_focused(*focused);
                }
            }
        })
        .setup(move |app| {
            info!("Log Level: {:?}", log_level);

            // Presence / power state machine. Keep this alive for the whole
            // process: the control socket, idle watcher and focus handler all
            // share it.
            let power = PowerManager::new(app.handle().clone(), 300);
            app.manage(power.clone());
            power.start();

            let (mut event_processor, process_event_sender) =
                EventProcessor::new(app.handle().clone(), power.clone());

            // Start event processor in background
            tauri::async_runtime::spawn(async move {
                event_processor.run().await;
            });

            let mut pty_manager = PtySessionManager::new(process_event_sender.clone());
            pty_manager.start(app.handle().clone());

            // Refresh and emit system information on a dedicated OS thread.
            //
            // Why a plain `std::thread` and not `tauri::async_runtime::spawn`
            // or `spawn_blocking`? One tick of sysinfo refresh + extraction
            // inside `SystemMonitor::run` averages ~84 ms, which is two
            // orders of magnitude above Tokio's 10–100 µs guideline for work
            // that runs on async worker threads, and the loop runs for the
            // full lifetime of the app. Tokio's own docs call this case out
            // explicitly:
            //
            //     For tasks that run forever ... use `std::thread::spawn`
            //     directly.
            //     — https://docs.rs/tokio/latest/tokio/task/index.html
            //
            // `spawn_blocking` would permanently park one slot in Tokio's
            // bounded blocking-thread pool (default 512) for no benefit. A
            // plain named OS thread is cheaper, shows up clearly in
            // `top -H` / profilers, and decouples the monitor from the
            // async runtime entirely.
            //
            // The thread is fire-and-forget. It bails on its own when the
            // event channel receiver is dropped during shutdown (see
            // `SystemMonitor::run`), and the OS reaps it on process exit
            // regardless. No `JoinHandle` or shutdown signal is needed
            // because the monitor holds no external resources that require
            // explicit cleanup.
            let monitor = SystemMonitor::new(2, process_event_sender.clone(), power.clone());
            std::thread::Builder::new()
                .name("edex-sysmon".into())
                .spawn(move || monitor.run())
                .expect("failed to spawn system monitor thread");

            let cluster = ClusterMonitor::new(power.clone(), app.handle().clone());
            std::thread::Builder::new()
                .name("edex-cluster".into())
                .spawn(move || cluster.run())
                .expect("failed to spawn cluster monitor thread");

            let tmux = TmuxMonitor::new(power.clone(), app.handle().clone());
            std::thread::Builder::new()
                .name("edex-tmux".into())
                .spawn(move || tmux.run())
                .expect("failed to spawn tmux monitor thread");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running edex");
}
