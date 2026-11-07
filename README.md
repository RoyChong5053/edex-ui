# eDex-UI

This is a rewrite of project [edex-ui](https://github.com/GitSquared/edex-ui) using [Tauri](https://github.com/tauri-apps/tauri).

The primary reason for rewriting stems from the original package being archived and exhibiting poor performance, characterized by excessively high CPU usage and high memory usage.
Furthermore, there is a need to enhance the displayed information with more practical and valuable content for daily usage.

Currently, this project only support macOS and Linux since I do not do development on Windows (PR Welcome.).

### Major Change

- No limit on number of terminals
- Show temperature on major hardware like CPU, GPU and Battery on laptop
- Remove keyboard as it is useless during daily usage
- Replace geolocation view with disks view

### Followup

> PR welcome on new features or bug fix

- More styling or functions on terminal
- Add support for styles in the original packages
- More hardware information support, currently temperature sensors are not supported in M series chip nor AMD GPUs.

## 仓库结构（本项目）

本仓库是 `edex-ui` 的 Tauri 重写版，并包含针对 **d3180**（弱核显 Intel HD400 / CherryView，2 核 Celeron N3060，2C/2T，3.8GB）的定制开发。

### 主 PC（编辑器 / CachyOS）

```
~/mycode/edex-ui/            # 编辑/开发根目录（git 仓库，已 push 到 origin）
├── src/、src-tauri/、deploy/ ...   # edex-ui (Tauri) 源码 + d3180 定制（8 个本地 d3180 提交）
└── tui/                     # edex-tui（纯终端座舱，独立本地 git 仓库，不 push）
```

- **`edex-ui`（Tauri）**：已 `git commit + push` 到 `github.com/RoyChong5053/edex-ui`。构建产物（`src-tauri/target/`、`node_modules`、`dist/` 等）已被 `.gitignore` 忽略，**不入库**。
- **`tui/`（edex-tui）**：独立本地 git 仓库，**不 push**（见 `tui/README.md`）。为不与 Tauri 主仓库混淆，已加入 `.git/info/exclude`（作为嵌套仓库、不提交为主仓库的子模块）。

### d3180（目标机 / Kali Rolling）

```
/mnt/sdcard/mycode/edex-ui/   # d3180 上的工作目录（从 ~/edex-ui-build 迁来）
```

- 在 d3180 上 `git pull` 拉取主 PC 推送的最新源码（线性历史，可 fast-forward）。
- **构建必须在 d3180 上做**（glibc / webkit2gtk 版本匹配；禁止从主 PC 交叉拷贝二进制）。
- 部署：`cargo build --release` → `sudo install -m 755 src-tauri/target/release/edex /opt/edex/edex` → `sudo systemctl restart edex`。
- 构建产物（`target/`）留在本地即可，不入库。

## Build

Since it use Tauri framework, make sure setup environment properly following [guide](https://tauri.app/start/prerequisites/).

### Development

```
pnpm run dev
```

### Production Build

```
pnpm run build
```

#### Debug Build

```
pnpm run build-debug
```

## Performance

### MacOS (Intel, M series)

On MacOS, it consumes around 1% Total CPU and less than 500Mb memory including webkit memory usage.

### Linux (Wayland)

~~Due to Tauri use `webkitgtk` on linux, it consumes around 5% Total CPU which majorly caused by poor performance of the dependency.~~
With latest performance improve, the total CPU is around 0.3% while keeping the memory usage below 200mb on my machine. (If you still see relatively high cpu on idle, it is likely due to the rendering engine you are using which is not sufficient that make it expensive to render html canvas (i.e. CPU flow chart))

## Screenshots

![1](screenshots/screenshot.webp)
[neofetch](https://github.com/dylanaraps/neofetch) on MacOS

![2](screenshots/screenshot2.webp)
[fastfetch](https://github.com/fastfetch-cli/fastfetch/) on Fedora
