# NetKeeper — Functional & Non-Functional Requirements

Version: **3.0.0** · Platform: **macOS** · Status: living document

This document states what NetKeeper must do (functional) and how well it must do it (non-functional), in a testable form. It reflects the current implementation and separates **implemented**, **partial**, and **planned** items.

Legend: Yes = implemented · Partial = partially implemented · Planned = not yet implemented

---

## 1. Scope

NetKeeper is a local-first macOS desktop application for **monitoring, recovering and repairing Wi-Fi connectivity**. It targets single-user machines and requires no server component.

**In scope:** Wi-Fi scanning, live link diagnostics, automatic recovery/switching, OS-level network-plist repair, persistent logging, launch-at-login, menu-bar operation.

**Out of scope:** cloud sync, accounts, mobile/Windows/Linux clients, password management, captive-portal automation, VPN management.

---

## 2. Definitions

| Term | Meaning |
| --- | --- |
| **Scan** | A call to `airport -s` listing nearby networks |
| **Radio** | The Wi-Fi power state (`On`/`Off`) |
| **Quality** | Signal percentage derived from RSSI |
| **Deep Repair** | Deleting macOS SystemConfiguration plists to fix a corrupted mapping |
| **Auto-Heal** | Automatic radio power-cycle when a scan returns 0 networks |
| **Known network** | An SSID macOS has previously joined |

---

## 3. Functional requirements

### FR-1 — Network scanning

| ID | Requirement | Status |
| --- | --- | --- |
| FR-1.1 | List all nearby Wi-Fi networks across **2.4 GHz and 5 GHz**, all vendors, with no vendor filtering | Yes |
| FR-1.2 | For each network, report **SSID, BSSID, RSSI, channel, security** | Yes |
| FR-1.3 | Correctly parse RSSI (negative dBm) for every row — the historical 1-vs-3 mis-parse must not recur | Yes |
| FR-1.4 | Allow a manual scan at any time via the Scan button | Yes |
| FR-1.5 | Prevent concurrent scans; a second request coalesces onto the in-flight one | Yes |
| FR-1.6 | Fall back to `networksetup` if `airport` is unavailable | Yes |

### FR-2 — Live dashboard

| ID | Requirement | Status |
| --- | --- | --- |
| FR-2.1 | Show current SSID, IP, router, subnet, DNS, public IP | Yes |
| FR-2.2 | Show radio state (On/Off) and link quality (%) | Yes |
| FR-2.3 | Show hardware details: TX rate, BSSID, band, security, uptime | Yes |
| FR-2.4 | Maintain rolling histories of signal, latency and network count | Yes |
| FR-2.5 | Show summary stats (networks found, best signal, channel usage) | Yes |

### FR-3 — Diagnostics & charts

| ID | Requirement | Status |
| --- | --- | --- |
| FR-3.1 | Render signal-quality history as a chart with a configurable red threshold line | Yes |
| FR-3.2 | Render latency history with an average reference line | Yes |
| FR-3.3 | Render per-channel congestion as a bar chart | Yes |
| FR-3.4 | Render 2.4/5 GHz band split as a donut | Yes |
| FR-3.5 | Charts must be interactive (hover tooltip with exact values) | Yes |
| FR-3.6 | Charts must be implemented **without third-party chart libraries** | Yes |
| FR-3.7 | Health-check gateway, DNS and internet reachability | Yes |

### FR-4 — Automatic recovery

| ID | Requirement | Status |
| --- | --- | --- |
| FR-4.1 | Auto-Heal: if a scan returns 0 networks, wait and retry, then power-cycle the radio | Yes |
| FR-4.2 | Auto-Heal enforces a cooldown to avoid thrashing | Yes |
| FR-4.3 | Auto-Reconnect: rejoin the last known network when the link drops | Yes |
| FR-4.4 | Reconnect on Wake: detect sleep/wake via heartbeat gap and restore the link | Yes |
| FR-4.5 | Keep-Alive: ping at a user-configurable interval | Yes |

### FR-5 — Best-network switching

| ID | Requirement | Status |
| --- | --- | --- |
| FR-5.1 | Switch to a stronger **known** network when signal gain ≥ 12 dB or quality < threshold | Yes |
| FR-5.2 | Respect a preferred-band setting (Auto / 2.4 / 5 GHz) | Yes |
| FR-5.3 | Respect a preferred-networks allow-list | Yes |
| FR-5.4 | Optionally block open/unencrypted networks | Yes |
| FR-5.5 | Enforce a switching cooldown/lock | Yes |

### FR-6 — Deep Network Repair (signature)

| ID | Requirement | Status |
| --- | --- | --- |
| FR-6.1 | Detect "radio ON but no usable IPv4 / link-local only" DHCP failure | Yes |
| FR-6.2 | Delete `NetworkInterfaces.plist` and `preferences.plist` as admin | Yes |
| FR-6.3 | Obtain admin via the native macOS dialog (`osascript`); never store the password | Yes |
| FR-6.4 | Flush DNS cache after repair | Yes |
| FR-6.5 | Offer a reboot (native dialog); reboot required to fully complete | Yes |
| FR-6.6 | Support on-demand **and** automatic (opt-in) repair with cooldown + lock | Yes |

### FR-7 — Logging

| ID | Requirement | Status |
| --- | --- | --- |
| FR-7.1 | Persist every scan, repair, switch, reconnect and error to disk | Yes |
| FR-7.2 | Store logs as append-only JSONL | Yes |
| FR-7.3 | Display logs newest-first in the Recovery Log tab | Yes |
| FR-7.4 | Allow clearing all logs | Yes |
| FR-7.5 | Cap log retrieval (500 entries) for performance | Yes |

### FR-8 — Settings

| ID | Requirement | Status |
| --- | --- | --- |
| FR-8.1 | Persist settings to `~/.config/netkeeper/settings.json` | Yes |
| FR-8.2 | Provide toggles for reconnect, keep-alive, wake, switching, notifications, dock/menu-bar, autostart | Yes |
| FR-8.3 | Debounce saves to avoid write storms | Yes |
| FR-8.4 | Provide ping targets and keep-alive interval choices | Yes |
| FR-8.5 | Provide quality-threshold and interface selection | Yes |
| FR-8.6 | Reset settings to defaults | Yes |

### FR-9 — Onboarding & guidance

| ID | Requirement | Status |
| --- | --- | --- |
| FR-9.1 | First-run modal explains Location permission and bundled scanning | Yes |
| FR-9.2 | Persist onboarding completion | Yes |
| FR-9.3 | Provide a Welcome/landing tab with feature explanation and FAQ | Yes |
| FR-9.4 | Provide a guided spotlight tour over the real UI | Yes |
| FR-9.5 | Provide in-app Help reference | Yes |

### FR-10 — System integration

| ID | Requirement | Status |
| --- | --- | --- |
| FR-10.1 | Operate from the macOS menu bar with Show / Hide / Quit | Yes |
| FR-10.2 | Configurable close-to-tray vs quit behaviour | Yes |
| FR-10.3 | Optionally show/hide the Dock icon | Yes |
| FR-10.4 | Launch at login via a LaunchAgent | Yes |
| FR-10.5 | Native notifications for disconnect and IP change | Yes |
| FR-10.6 | Detect the real Wi-Fi interface rather than assuming `en0` | Yes |
| FR-10.7 | Manual radio on/off, connect, disconnect and emergency reset | Yes |

---

## 4. Non-functional requirements

### NFR-1 — Performance

| ID | Requirement | Metric |
| --- | --- | --- |
| NFR-1.1 | No UI freeze during scans/commands | All IO commands run `async` off the main thread |
| NFR-1.2 | Scanning coalesced & throttled | background ≤ 1 scan / 45 s; single in-flight |
| NFR-1.3 | Steady-state polling lightweight | radio/stats poll every 10 s |
| NFR-1.4 | Frontend bundle small | production build ≈ 250–260 KB (no chart libs) |
| NFR-1.5 | Charts render without measurable jank | `< 16 ms` per frame with ResizeObserver sizing |

### NFR-2 — Reliability & resilience

| ID | Requirement |
| --- | --- |
| NFR-2.1 | Every command returns `Result<T, String>`; UI catches and logs failures |
| NFR-2.2 | Risky loops use locks and cooldowns (heal 60 s, switch 45 s, deep repair 5 min) |
| NFR-2.3 | Missing/malformed config files fall back to defaults, never crash |
| NFR-2.4 | App recovers gracefully if `airport` or a shell tool is missing |
| NFR-2.5 | Background monitoring continues while the window is hidden |

### NFR-3 — Usability & accessibility

| ID | Requirement |
| --- | --- |
| NFR-3.1 | macOS-native visual language (SF-like type, hairlines, system colours) |
| NFR-3.2 | Responsive layout with no fixed max-width caps on data views |
| NFR-3.3 | Keyboard-accessible controls with focus states |
| NFR-3.4 | Guided tour explains the UI without external documentation |
| NFR-3.5 | Clear, non-technical status language in Recovery Log |

### NFR-4 — Security & privacy

| ID | Requirement |
| --- | --- |
| NFR-4.1 | No telemetry; all data local |
| NFR-4.2 | No storage or transmission of Wi-Fi passwords |
| NFR-4.3 | Admin elevation only via the native dialog; no stored secrets |
| NFR-4.4 | Least privilege: only repair resets escalate |
| NFR-4.5 | No secrets committed to the repository |

> Hardening task: `tauri.conf.json` currently sets allowlist `all: true`; scope it down. Planned

### NFR-5 — Compatibility

| ID | Requirement |
| --- | --- |
| NFR-5.1 | macOS 12+ (Monterey or newer) |
| NFR-5.2 | Apple Silicon and Intel |
| NFR-5.3 | Node 18+ / Rust stable / Tauri prerequisites for building |
| NFR-5.4 | No GPU or special hardware requirements |

### NFR-6 — Maintainability

| ID | Requirement |
| --- | --- |
| NFR-6.1 | TypeScript `strict`, `noUnusedLocals`, `noUnusedParameters` all `true` |
| NFR-6.2 | Rust compiles clean with `cargo check` |
| NFR-6.3 | Public commands and types documented |
| NFR-6.4 | Consistent naming and modular command organization |
| NFR-6.5 | Legacy unused files (`Help.tsx`, `main.js`, `style.css`) to be removed Planned |

### NFR-7 — Testability

| ID | Requirement | Status |
| --- | --- | --- |
| NFR-7.1 | TypeScript type-checks with `tsc --noEmit` | Yes |
| NFR-7.2 | Production build succeeds (`npm run build`) | Yes |
| NFR-7.3 | Rust compiles (`cargo check`) | Yes |
| NFR-7.4 | Automated unit tests for the Rust command layer | Planned |
| NFR-7.5 | Runnable on real macOS hardware for behavioural verification | Manual |

### NFR-8 — Localization & documentation

| ID | Requirement | Status |
| --- | --- | --- |
| NFR-8.1 | English-only UI | Yes |
| NFR-8.2 | README + architecture + requirements docs | Yes |
| NFR-8.3 | Screenshot capture guide | Yes |
| NFR-8.4 | Multi-language UI | Planned |

---

## 5. Assumptions & constraints

- The user has (or can grant) **Location Services** access for full scan results.
- **Admin rights** are available for Deep Repair; the user may cancel the prompt.
- `airport` is **deprecated** and may be removed by a future macOS → `CoreWLAN` migration is a constraint-driven roadmap item.
- Network switching only works for networks macOS already knows.
- MySQL/cloud backends are intentionally absent — the app is single-user and offline.

---

## 6. Traceability (feature → requirement)

| README feature | Requirements |
| --- | --- |
| Deep Network Repair | FR-6, FR-7 |
| Auto-Heal radio crash | FR-4.1, FR-4.2 |
| Real, unfiltered scanning | FR-1 |
| Auto-reconnect & switching | FR-4.3, FR-5 |
| Reconnect on Wake | FR-4.4 |
| Keep-alive pings | FR-4.5 |
| Live diagnostics & charts | FR-2, FR-3 |
| Recovery log | FR-7 |
| Menu bar, notifications, autostart | FR-10 |
| Landing page & guided tour | FR-9 |

---

## 7. Acceptance summary

A release is acceptable when **all Yes functional requirements pass on real macOS hardware**, the non-functional performance and reliability targets hold under sustained use (including hidden-window operation), and `npx tsc --noEmit`, `cargo check`, and `npm run build` all succeed.
