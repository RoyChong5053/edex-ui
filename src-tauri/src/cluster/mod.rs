use crate::power::PowerManager;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const HISTORY_LEN: usize = 15;
const PING_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NodeConfig {
    name: String,
    host: String,
    #[serde(default)]
    wan: bool,
    #[serde(default)]
    local: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ClusterConfig {
    nodes: Vec<NodeConfig>,
}

#[derive(Debug, Clone, Serialize)]
struct ClusterNode {
    name: String,
    host: String,
    online: bool,
    latency: Option<f32>,
    history: Vec<Option<f32>>,
    wan: bool,
    local: bool,
}

#[derive(Debug, Clone, Serialize)]
struct ClusterStatus {
    nodes: Vec<ClusterNode>,
    updated: u64,
}

pub struct ClusterMonitor {
    power: Arc<PowerManager>,
    app_handle: AppHandle,
    nodes: Vec<NodeConfig>,
    history: Vec<VecDeque<Option<f32>>>,
}

impl ClusterMonitor {
    pub fn new(power: Arc<PowerManager>, app_handle: AppHandle) -> Self {
        let nodes = load_config();

        Self {
            power,
            app_handle,
            history: nodes.iter().map(|_| VecDeque::new()).collect(),
            nodes,
        }
    }

    pub fn run(mut self) {
        loop {
            self.power.wait_active();

            let latencies = ping_all(&self.nodes);
            for (index, latency) in latencies.into_iter().enumerate() {
                let history = &mut self.history[index];
                history.push_back(latency);
                while history.len() > HISTORY_LEN {
                    history.pop_front();
                }
            }

            let nodes = self
                .nodes
                .iter()
                .enumerate()
                .map(|(index, node)| {
                    let latency = self.history[index].back().copied().flatten();
                    ClusterNode {
                        name: node.name.clone(),
                        host: node.host.clone(),
                        online: latency.is_some(),
                        latency,
                        history: self.history[index].iter().copied().collect(),
                        wan: node.wan,
                        local: node.local,
                    }
                })
                .collect();

            let status = ClusterStatus {
                nodes,
                updated: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or_default(),
            };

            if let Err(e) = self.app_handle.emit("cluster", status) {
                error!("Failed to emit cluster status: {e}");
            }

            thread::sleep(PING_INTERVAL);
        }
    }
}

fn ping_all(nodes: &[NodeConfig]) -> Vec<Option<f32>> {
    thread::scope(|scope| {
        let handles: Vec<_> = nodes
            .iter()
            .map(|node| {
                let host = node.host.clone();
                scope.spawn(move || ping_once(&host))
            })
            .collect();

        handles
            .into_iter()
            .map(|handle| handle.join().unwrap_or(None))
            .collect()
    })
}

fn ping_once(host: &str) -> Option<f32> {
    let output = Command::new("timeout")
        .args(["3", "ping", "-n", "-c", "1", "-W", "1", host])
        .output()
        .or_else(|_| {
            Command::new("ping")
                .args(["-n", "-c", "1", "-W", "1", host])
                .output()
        })
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().find_map(|line| {
        let value = line.split("time=").nth(1)?;
        if value.starts_with('<') {
            return Some(0.5);
        }
        let number: String = value
            .chars()
            .take_while(|c| c.is_ascii_digit() || *c == '.')
            .collect();
        number
            .parse::<f32>()
            .ok()
            .map(|v| (v * 10.0).round() / 10.0)
    })
}

fn config_path() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| {
        PathBuf::from(home)
            .join(".config")
            .join("edex")
            .join("cluster.json")
    })
}

fn load_config() -> Vec<NodeConfig> {
    let Some(path) = config_path() else {
        warn!("HOME is not set, using built-in cluster node list");
        return default_config().nodes;
    };

    match std::fs::read_to_string(&path) {
        Ok(raw) => match serde_json::from_str::<ClusterConfig>(&raw) {
            Ok(config) if !config.nodes.is_empty() => config.nodes,
            Ok(_) => {
                warn!("Cluster config at {} has no nodes", path.display());
                default_config().nodes
            }
            Err(e) => {
                error!("Failed to parse {}: {e}", path.display());
                default_config().nodes
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let config = default_config();
            write_default_config(&path, &config);
            config.nodes
        }
        Err(e) => {
            error!("Failed to read {}: {e}", path.display());
            default_config().nodes
        }
    }
}

fn write_default_config(path: &Path, config: &ClusterConfig) {
    let Some(parent) = path.parent() else {
        return;
    };

    if let Err(e) = std::fs::create_dir_all(parent) {
        warn!("Failed to create {}: {e}", parent.display());
        return;
    }

    match serde_json::to_string_pretty(config) {
        Ok(raw) => match std::fs::write(path, raw + "\n") {
            Ok(_) => info!("Wrote default cluster config to {}", path.display()),
            Err(e) => warn!("Failed to write {}: {e}", path.display()),
        },
        Err(e) => warn!("Failed to serialize default cluster config: {e}"),
    }
}

fn default_config() -> ClusterConfig {
    ClusterConfig {
        nodes: vec![
            NodeConfig {
                name: "Cloudflare".into(),
                host: "1.1.1.1".into(),
                wan: true,
                local: false,
            },
            NodeConfig {
                name: "Google".into(),
                host: "8.8.8.8".into(),
                wan: true,
                local: false,
            },
            NodeConfig {
                name: "Lenovo LOQ".into(),
                host: "192.168.100.200".into(),
                wan: false,
                local: false,
            },
            NodeConfig {
                name: "Dell M6400".into(),
                host: "192.168.100.78".into(),
                wan: false,
                local: false,
            },
            NodeConfig {
                name: "GT20".into(),
                host: "192.168.100.242".into(),
                wan: false,
                local: false,
            },
            NodeConfig {
                name: "LG-V35".into(),
                host: "192.168.100.17".into(),
                wan: false,
                local: false,
            },
            NodeConfig {
                name: "Mate10".into(),
                host: "192.168.100.22".into(),
                wan: false,
                local: false,
            },
            NodeConfig {
                name: "Honor-5X".into(),
                host: "192.168.100.28".into(),
                wan: false,
                local: false,
            },
            NodeConfig {
                name: "D3180".into(),
                host: "192.168.100.38".into(),
                wan: false,
                local: true,
            },
        ],
    }
}
