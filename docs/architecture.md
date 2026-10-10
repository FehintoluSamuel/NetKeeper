# WiKeep — Architecture

This document describes how WiKeep is structured, how the React frontend and the Rust backend communicate, how the scanning/repair scheduling works, and where the important extension points are.

Related docs: [`../README.md`](../README.md) · [`functional-and-non-functional-requirements.md`](functional-and-non-functional-requirements.md)

---

## 1. High-level overview

WiKeep is a **Tauri 1.x desktop app**: a Rust core process that owns the OS and window, and a React/TypeScript UI rendered inside the system WebView (WKWebView on macOS). The two halves communicate over Tauri's IPC bridge using `invoke`.

```
┌──────────────────────────────────────────────────────────────────┐
│                         macOS host                                │
│                                                                    │
│  ┌────────────────────────┐        ┌───────────────────────────┐  │
│  │   WKWebView (frontend) │  IPC   │   Rust core (src-tauri)   │  │
│  │                        │ ─────► │                           │  │
│  │  React 18 + TS + Vite  │ invoke │  #[tauri::command(async)]  │  │
│  │  • App.tsx (UI/logic)  │ ◄───── │  • scan / stats / repair  │  │
│  │  • SVG chart components│ events │  • settings / logs (fs)   │  │
│  │  • Landing + Tour      │        │  • tray / window / dock   │  │
│  └────────────────────────┘        └─────────────┬─────────────┘  │
│                                                  │                 │
│                                   std::process::Command / osascript│
│                                                  ▼                 │
│   airport · networksetup · ipconfig · netstat · ping · scutil · …  │
│   /Library/Preferences/SystemConfiguration/*.plist  (Deep Repair)  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Process & thread model

| Layer | Runs on | Notes |
| --- | --- | --- |
| WebView UI | WebView main thread | React render loop, charts, intervals |
| **Sync** `#[tauri::command]` | **Main thread** | Only `set_dock_visible` — it must call AppKit |
| **Async** `#[tauri::command(async)]` | Async runtime thread pool | All scanning, pinging, file IO, repair |

**Why this matters:** in Tauri v1 a non-`async` command runs *synchronously on the macOS main thread*. Shelling out to `airport -s` (1–3 s) there freezes the entire UI. Therefore **every command that does work is declared `#[tauri::command(async)]`**, which offloads it to the runtime thread pool. The lone exception is `set_dock_visible`, which performs an `NSApplication` activation-policy call and must stay on the main thread.

> See `src-tauri/src/main.rs` — the async attribute is applied per command; `set_dock_visible` is deliberately left synchronous.

---

## 3. Frontend architecture

The frontend is intentionally a **single large component** (`src/App.tsx`) plus a couple of small helpers.

```
src/
├── main.tsx          # ReactDOM root, <React.StrictMode>
├── App.tsx           # Everything below
├── Onboarding.tsx    # First-run permission modal
├── index.css
└── Help.tsx          # LEGACY — unused; active help is inline in App.tsx
```

### 3.1 Components in `App.tsx`

| Component | Responsibility |
| --- | --- |
| `App` | Root: holds all state, effects, intervals and the tab router |
| `AreaChart` | Dependency-free smooth SVG area chart (gridlines, threshold/avg lines, hover tooltip) |
| `BarChart` | SVG bar chart for channel congestion |
| `DonutChart` | SVG segmented ring for 2.4/5 GHz split |
| `LandingPage` | Webpage-style Welcome tab |
| `Tour` | 10-step spotlight overlay driving `setActiveTab` |
| `HelpPage` | In-app reference (inline, replaces legacy `Help.tsx`) |
| `OnboardingModal` | Imported from `Onboarding.tsx` |

Supporting utilities: `mapNetworks`, `parseInterval`, `useMeasuredWidth` (ResizeObserver hook), `smoothPath` (cubic smoothing).

### 3.2 State & refs

State is held with `useState`; high-frequency or cross-effect values use `useRef` to avoid stale closures and re-renders.

- **State:** `activeTab`, `networks`, `currentSsid`, `isScanning`, `radioOn`, `quality`, `signalHistory`, `latencyHistory`, `netCountHistory`, `settings`, `logs`, `tourOpen`, …
- **Refs:** `settingsRef`, `qualityRef`, `doScanRef`, `scanInFlightRef`, `lastScanTsRef`, `lastScanDataRef`, `switchLockRef`, `lastSwitchRef`, `lastConnectedSsidRef`, `lastHeartbeatRef`, `lastIpRef`, `repairLockRef`, `lastRepairRef`, `notifyReadyRef`.

### 3.3 Tab router

`activeTab: Tab` selects which view renders. `Tab` = `welcome | overview | networks | diagnostics | settings | log | help`. On first run `activeTab` defaults to `welcome` (persisted in `localStorage` as `wikeep_welcome_seen`).

### 3.4 Scheduling & performance design

Background work runs on a fixed set of intervals. To prevent overlapping `airport -s` calls (which stall the radio), scanning is **coalesced**:

| Loop | Interval | Behaviour |
| --- | --- | --- |
| Radio/stats poll | **10 s** | `get_radio_state` + `get_link_stats` |
| Shared background scan | **60 s** | `doScan(false)` — throttled by the guard below |
| Auto-heal monitor | **60 s** | reads the shared scan cache, re-scans on 0 networks |
| Connection manager | **60 s** | reads the shared scan cache, acts only if settings allow |
| Keep-alive pings | user interval (15 s / 30 s / 60 s / 5 m) | `ping_host` for router/DNS/internet |
| Wake heartbeat | **5 s** | detects sleep/wake via a >90 s gap |

`doScan(force = true)`:

1. If a scan is already in flight → returns the in-flight promise (no duplicate).
2. If `force === false` and the last scan was `< 45 s` ago → returns immediately.
3. Otherwise runs, caching `{ networks, currentName }` in `lastScanDataRef` for other loops to consume.

This gives one authoritative scan stream that manual clicks can bypass but background loops cannot flood.

---

## 4. Backend architecture

All backend code lives in `src-tauri/src/main.rs`. It is organized as:

1. **Types** — `WifiNetwork`, `IpInfo`, `PingResult`, `AppSettings`, `LogEntry`, `DhcpState` (Serde `Serialize`/`Deserialize`).
2. **Path helpers** — `config_dir()`, `settings_path()`, `logs_path()`, `onboarded_path()`, `launch_agent_path()`.
3. **Commands** — `#[tauri::command(async)]` functions invoked from the UI.
4. **macOS integration** — tray, window events, activation policy, `osascript` admin flows.
5. **`main()`** — builds the tray, registers handlers, wires `.setup()`, tray events and window events.

### 4.1 Key helper logic

- `detect_wifi_interface()` — finds the real Wi-Fi device instead of assuming `en0`: (1) match the `Wi-Fi`/`AirPort` hardware port from `networksetup -listallhardwareports`, (2) first `en*` with an IPv4 address, (3) first `en*`, (4) `en0`.
- `sync_autostart(enabled)` — writes/removes a LaunchAgent (`com.wikeep.app.plist`); only acts when running from a packaged `.app`.
- `scan_wifi()` — parses `airport -s`, using a robust scan for the negative RSSI token (fixes the classic 1-vs-3 parsing bug), then derives SSID/BSSID/channel/security.
- `check_dhcp_state()` — healthy unless *radio ON* **and** (no IPv4 **or** a `169.254.*` link-local address).
- `deep_network_repair()` / `prompt_reboot()` — `osascript` flows. The repair deletes the two mapping plists **and stale DHCP leases**, restarts `configd` (`killall -HUP`) **before** reboot so the mapping is rebuilt from a fresh hardware scan instead of being rewritten from memory at shutdown, re-enumerates the radio, and writes a `.post_repair` marker so the next launch rejoins the same network. If the AirPort interface still isn't enumerated afterwards it reports an SMC/NVRAM reset, which no app can perform.

### 4.2 macOS integration

| Concern | Mechanism |
| --- | --- |
| Menu bar | `SystemTray` with Show / Hide to Tray / Quit |
| Close button | `on_window_event` → hide to tray if `show_menu_bar`, else quit |
| Dock show/hide | `NSApplication.setActivationPolicy` via `objc` (Regular ⇄ Accessory) |
| Admin operations | `osascript … with administrator privileges` (native prompt; no stored secrets) |
| Autostart | LaunchAgent plist in `~/Library/LaunchAgents` |

---

## 5. IPC command reference

All commands are `async` unless noted.

| Command | Signature (JS args) | Returns | Purpose |
| --- | --- | --- | --- |
| `scan_wifi` | — | `WifiNetwork[]` | Real `airport -s` scan, all vendors |
| `get_current_wifi` | — | `string` | Current network line from `networksetup` |
| `get_wifi_interface` | — | `string` | Detected interface (e.g. `en0`) |
| `get_ip_info` | — | `IpInfo` | IP, router, subnet, public IP, DNS, TX rate, uptime, BSSID, band, security |
| `ping_host` | `{ host }` | `PingResult` | Single ICMP ping, returns ms + ok |
| `get_link_stats` | — | `{ signal_dbm }` | RSSI from `airport -I` |
| `get_radio_state` | — | `bool` | Wi-Fi power state |
| `set_radio` | `{ on }` | `string` | Power the radio on/off |
| `connect_wifi` | `{ ssid, password }` | `string` | Join a network (password optional) |
| `disconnect_wifi` | — | `string` | Disassociate without power cycle |
| `emergency_reset` | — | `string` | Radio off → 1 s → on, then app re-scans |
| `simulate_disconnect` | `{ interface }` | `string` | Demo: power the radio off |
| `force_restart_service` | `{ interface }` | `string` | Full reset + DNS flush + DHCP renew |
| `restore_connection` | `{ interface, ssid }` | `string` | Demo: power the radio back on |
| `check_dhcp_state` | — | `DhcpState` | Detects "radio ON but no usable IP" |
| `deep_network_repair` | — | `string` | Deletes the two SystemConfiguration plists (admin) |
| `prompt_reboot` | — | `"reboot"｜"later"` | Native reboot dialog |
| `get_settings` | — | `AppSettings` | Read settings JSON (defaults if absent) |
| `save_settings` | `{ settings }` | `string` | Persist settings; syncs autostart |
| `get_logs` | — | `LogEntry[]` | Read logs (newest first, capped 500) |
| `append_log` | `{ entry }` | `string` | Append one JSONL entry |
| `clear_logs` | — | `string` | Truncate the log file |
| `get_onboarding_status` | — | `bool` | Whether onboarding was completed |
| `set_onboarded` / `reset_onboarding` | — | `string` | Toggle onboarding flag |
| `get_autostart` / `set_autostart` | `{ enabled }` | `bool` / `string` | LaunchAgent state |
| `set_dock_visible` | `{ visible }` | `string` | **Sync** — toggles Dock icon (AppKit) |

---

## 6. Data model

```ts
AppSettings = {
  auto_reconnect, keep_alive, keep_alive_interval, reconnect_on_wake,
  auto_switch_strongest, preferred_band, block_open, launch_at_login,
  show_menu_bar, show_dock, notify_disconnect, notify_ip_change,
  ping_router_target, ping_dns_target, ping_internet_target,
  quality_threshold, interface_name, preferred_networks[],
  simulation_mode, auto_heal, auto_deep_repair
}

WifiNetwork = { ssid, bssid, rssi, channel, security }
IpInfo      = { ip, router, subnet, public_ip, dns[], tx_rate, uptime, bssid, band, security }
PingResult  = { ms: number | null, ok: boolean }
LogEntry    = { id, timestamp, time_ms, level, source, message, detail? }
DhcpState   = { healthy, ip, state, detail }
```

Types are mirrored on both sides: Serde structs in Rust, TypeScript types in `App.tsx`.

---

## 7. Persistence

| Data | Format | Path |
| --- | --- | --- |
| Settings | JSON (pretty) | `~/.config/wikeep/settings.json` |
| Logs | JSONL (append-only) | `~/.config/wikeep/logs.jsonl` |
| Onboarding flag | marker file | `~/.config/wikeep/.onboarded` |
| Post-repair handoff | marker file | `~/.config/wikeep/.post_repair` |
| Autostart | LaunchAgent plist | `~/Library/LaunchAgents/com.wikeep.app.plist` |
| Welcome-seen | browser storage | `localStorage["wikeep_welcome_seen"]` |

Settings are saved with a 600 ms debounce whenever the `settings` object changes.

**Brand migration:** WiKeep was formerly *NetKeeper*. On first run under the new brand, `migrate_legacy_config()` copies `settings.json`, `logs.jsonl` and `.onboarded` from `~/.config/netkeeper/` into `~/.config/wikeep/` (only when the new file does not exist yet), so the old data carries over exactly once.

---

## 8. Security model

- **No cloud, no telemetry.** Only optional ping/latency probes and a public-IP lookup leave the machine.
- **No stored credentials.** Admin actions use the native macOS auth dialog via `osascript`; the app never receives the password.
- **Least privilege by intent.** Only Deep Network Repair and the force-restart script escalate; everything else runs as the user.
- **Tauri allowlist** is set to `all: true` in `tauri.conf.json` (broad) — tightening this is a recommended hardening task.

---

## 9. Error handling

- Every command returns `Result<T, String>`; the JS side wraps calls in `try/catch` and logs failures to the Recovery Log with a source tag.
- Long-running or risky loops use **locks and cooldowns**: `repairLockRef` + 5-minute cooldown for auto deep repair; `switchLockRef` + 45 s cooldown for network switching; 60 s cooldown for auto-heal resets.

---

## 10. Build & bundling

```
npm run dev        → Vite dev server (frontend only, :1420)
npm run build      → tsc && vite build  (dist/)
npm run tauri dev  → Tauri dev with hot reload
npm run tauri build→ .app + .dmg in src-tauri/target/release/bundle/
```

`tauri.conf.json` defines the window (1280×820, min 960×640, centered, resizable), the tray, `identifier: com.wikeep.app`, and bundles `targets: all`.

---

## 11. Extension points & technical debt

**Extension points**
- Add a new command in `main.rs` → register it in `generate_handler![]` → call via `invoke`.
- Add a tour step → push to `TOUR_STEPS` and add a matching `data-tour="…"` attribute to the target element.
- Add a view → extend the `Tab` union and the sidebar array.

**Known technical debt**
- `airport` is deprecated by Apple → plan a `CoreWLAN` adapter behind the same commands.
- `App.tsx` is large; extracting views/charts into modules would improve maintainability.
- Legacy unused files: `src/Help.tsx`, `src/main.js`, `src/style.css`.
- `Onboarding.tsx` contains malformed Tailwind class names (e.g. `text-`) that need cleanup.
- No automated test suite yet (see requirements doc, NFR-TST).
