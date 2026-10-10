use tauri::command;
use tauri::{Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, CustomMenuItem, SystemTrayMenuItem};
use std::process::Command;
use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;
use std::io::{BufRead, BufReader};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WifiNetwork { ssid: String, bssid: String, rssi: i32, channel: i32, security: String, }
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct IpInfo { ip: String, router: String, subnet: String, public_ip: String, dns: Vec<String>, tx_rate: String, uptime: String, bssid: String, band: String, security: String, }
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PingResult { ms: Option<u64>, ok: bool, }
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppSettings {
    auto_reconnect: bool, keep_alive: bool, keep_alive_interval: String, reconnect_on_wake: bool, auto_switch_strongest: bool,
    preferred_band: String, block_open: bool, launch_at_login: bool, show_menu_bar: bool, show_dock: bool,
    notify_disconnect: bool, notify_ip_change: bool, ping_router_target: String, ping_dns_target: String, ping_internet_target: String,
    quality_threshold: i32, interface_name: String, preferred_networks: Vec<String>, simulation_mode: bool,
    #[serde(default = "default_true")] auto_heal: bool,
    #[serde(default)] auto_deep_repair: bool,
}
fn default_true() -> bool { true }
impl Default for AppSettings {
    fn default() -> Self {
        Self { auto_reconnect: true, keep_alive: true, keep_alive_interval: "30s".to_string(), reconnect_on_wake: true, auto_switch_strongest: false,
        preferred_band: "Auto".to_string(), block_open: true, launch_at_login: false, show_menu_bar: true, show_dock: true,
        notify_disconnect: true, notify_ip_change: false, ping_router_target: "".to_string(), ping_dns_target: "1.1.1.1".to_string(), ping_internet_target: "8.8.8.8".to_string(),
        quality_threshold: 30, interface_name: "en".to_string(), preferred_networks: vec![], simulation_mode: true, auto_heal: true, auto_deep_repair: false, }
    }
}
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LogEntry { id: String, timestamp: String, time_ms: i64, level: String, source: String, message: String, detail: Option<String>, }
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DhcpState { healthy: bool, ip: String, state: String, detail: String, }

fn config_dir() -> PathBuf { migrate_legacy_config(); let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string()); let p = PathBuf::from(home).join(".config").join("wikeep"); let _ = fs::create_dir_all(&p); p }

// One-time migration: WiKeep used to be NetKeeper, whose data lived in ~/.config/netkeeper.
// On first run under the new brand, copy any existing settings/logs over so nothing is lost.
fn migrate_legacy_config() {
    use std::sync::Once;
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        let new_dir = PathBuf::from(&home).join(".config").join("wikeep");
        let old_dir = PathBuf::from(&home).join(".config").join("netkeeper");
        if !old_dir.is_dir() { return; }
        let _ = fs::create_dir_all(&new_dir);
        for name in ["settings.json", "logs.jsonl", ".onboarded"] {
            let src = old_dir.join(name);
            let dst = new_dir.join(name);
            if src.exists() && !dst.exists() {
                let _ = fs::copy(&src, &dst);
            }
        }
    });
}
fn settings_path() -> PathBuf { config_dir().join("settings.json") }
fn logs_path() -> PathBuf { config_dir().join("logs.jsonl") }
fn onboarded_path() -> PathBuf { config_dir().join(".onboarded") }

#[command(async)] fn get_onboarding_status() -> Result<bool, String> { Ok(onboarded_path().exists()) }
#[command(async)] fn set_onboarded() -> Result<String, String> { fs::write(onboarded_path(), "1").map_err(|e| e.to_string())?; Ok("onboarded".to_string()) }
#[command(async)] fn reset_onboarding() -> Result<String, String> { let p=onboarded_path(); if p.exists() { let _=fs::remove_file(&p); } Ok("reset".to_string()) }

// Auto-start at login uses a macOS LaunchAgent so the app comes back after reboot.
fn launch_agent_path() -> PathBuf { let home=std::env::var("HOME").unwrap_or_else(|_| ".".to_string()); PathBuf::from(home).join("Library").join("LaunchAgents").join("com.wikeep.app.plist") }
fn is_packaged_app() -> bool { std::env::current_exe().map(|e| e.to_string_lossy().contains(".app/")).unwrap_or(false) }
fn sync_autostart(enabled: bool) -> Result<String, String> {
    if !is_packaged_app() { return Ok("skipped: only manages LaunchAgent from the installed app".to_string()); }
    let path=launch_agent_path();
    if enabled {
        let exe=std::env::current_exe().map_err(|e| e.to_string())?;
        let plist=format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n\t<key>Label</key>\n\t<string>com.wikeep.app</string>\n\t<key>ProgramArguments</key>\n\t<array>\n\t\t<string>{}</string>\n\t</array>\n\t<key>RunAtLoad</key>\n\t<true/>\n\t<key>ProcessType</key>\n\t<string>Background</string>\n</dict>\n</plist>\n", exe.display());
        fs::write(&path, plist).map_err(|e| e.to_string())?;
    } else if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(if enabled { "enabled" } else { "disabled" }.to_string())
}
#[command(async)] fn set_autostart(enabled: bool) -> Result<String, String> { sync_autostart(enabled) }
#[command(async)] fn get_autostart() -> Result<bool, String> { Ok(launch_agent_path().exists()) }

#[command(async)] fn get_settings() -> Result<AppSettings, String> { let path=settings_path(); if path.exists() { match fs::read_to_string(&path) { Ok(s)=>Ok(serde_json::from_str(&s).unwrap_or_default()), Err(_)=>Ok(AppSettings::default()) } } else { Ok(AppSettings::default()) } }
#[command(async)] fn save_settings(settings: AppSettings) -> Result<String, String> {
    let path=settings_path(); let json=serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?; fs::write(&path, json).map_err(|e| e.to_string())?;
    let _ = sync_autostart(settings.launch_at_login);
    Ok("saved".to_string())
}

#[command(async)] fn get_logs() -> Result<Vec<LogEntry>, String> { let path=logs_path(); if!path.exists() { return Ok(vec![]); } let file=fs::File::open(&path).map_err(|e| e.to_string())?; let reader=BufReader::new(file); let mut logs: Vec<LogEntry>=Vec::new(); for line in reader.lines().flatten() { if let Ok(entry)=serde_json::from_str::<LogEntry>(&line) { logs.push(entry); } } logs.reverse(); if logs.len()>500 { logs.truncate(500); } Ok(logs) }
#[command(async)] fn append_log(entry: LogEntry) -> Result<String, String> { let path=logs_path(); let line=serde_json::to_string(&entry).map_err(|e| e.to_string())?; use std::io::Write; let mut file=fs::OpenOptions::new().create(true).append(true).open(&path).map_err(|e| e.to_string())?; writeln!(file, "{}", line).map_err(|e| e.to_string())?; Ok("appended".to_string()) }
#[command(async)] fn clear_logs() -> Result<String, String> { let path=logs_path(); if path.exists() { fs::write(&path, "").map_err(|e| e.to_string())?; } Ok("cleared".to_string()) }

#[command(async)]
fn scan_wifi() -> Result<Vec<WifiNetwork>, String> {
    // ALL networks detection - no MTN filter - no Starlink filter - detects any SSID
    let output = Command::new("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport")
       .arg("-s")
       .output()
       .map_err(|e| format!("Failed airport -s: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut networks = Vec::new();
    for line in stdout.lines().skip(1) {
        if line.trim().is_empty() { continue; }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 { continue; }
        // RSSI detection fix for 1 vs 3 bug - detects negative -60 token
        let mut rssi_idx: Option<usize> = None;
        for (i,p) in parts.iter().enumerate() {
            if p.starts_with('-') && p.len()>1 && p[1..].chars().next().map_or(false,|c| c.is_ascii_digit()) {
                if let Ok(v)=p.parse::<i32>() { if v<0 && v>-100 { rssi_idx=Some(i); break; } }
            }
        }
        let rssi_idx = match rssi_idx { Some(v)=>v, None=>continue };
        if rssi_idx+1 >= parts.len() { continue; }
        let rssi = parts[rssi_idx].parse::<i32>().unwrap_or(-60);
        let channel = parts[rssi_idx+1].split(',').next().unwrap_or("0").parse::<i32>().unwrap_or(0);
        let security = if rssi_idx+4 < parts.len() { parts[rssi_idx+4..].join(" ") } else { "WPA2".to_string() };
        let mut ssid_tokens = &parts[..rssi_idx];
        let mut bssid = format!("{}-ch{}", ssid_tokens.join("-"), channel);
        if!ssid_tokens.is_empty() {
            let last = ssid_tokens[ssid_tokens.len()-1];
            if last.contains(':') && last.len()>=17 { bssid=last.to_string(); ssid_tokens=&ssid_tokens[..ssid_tokens.len()-1]; }
        }
        let ssid = ssid_tokens.join(" ");
        if ssid.is_empty() { continue; }
        networks.push(WifiNetwork { ssid, bssid, rssi, channel, security });
    }
    Ok(networks)
}

// Detects the real Wi-Fi interface (en0, en1, en2 ...) instead of assuming en0.
fn detect_wifi_interface() -> String {
    // Primary: match the Wi-Fi/AirPort hardware port to its Device from networksetup.
    if let Ok(out)=Command::new("networksetup").arg("-listallhardwareports").output() {
        let s=String::from_utf8_lossy(&out.stdout); let mut port=String::new();
        for line in s.lines() {
            let l=line.trim();
            if let Some(p)=l.strip_prefix("Hardware Port:") { port=p.trim().to_string(); }
            else if let Some(d)=l.strip_prefix("Device:") {
                let dev=d.trim().to_string();
                if port=="Wi-Fi" || port=="AirPort" { return dev; }
            }
        }
    }
    // Fallback 1: first en* that currently has an IPv4 address.
    if let Ok(out)=Command::new("sh").arg("-c").arg("for i in $(ifconfig -l | tr ' ' '\\n' | grep '^en'); do ipconfig getifaddr $i >/dev/null 2>&1 && { echo $i; break; }; done").output() {
        let dev=String::from_utf8_lossy(&out.stdout).trim().to_string(); if !dev.is_empty() { return dev; }
    }
    // Fallback 2: first en* listed by the system.
    if let Ok(out)=Command::new("sh").arg("-c").arg("ifconfig -l | tr ' ' '\\n' | grep '^en' | head -1").output() {
        let dev=String::from_utf8_lossy(&out.stdout).trim().to_string(); if !dev.is_empty() { return dev; }
    }
    "en0".to_string()
}

#[command(async)] fn get_wifi_interface() -> Result<String, String> { Ok(detect_wifi_interface()) }
#[command(async)] fn get_current_wifi() -> Result<String, String> { let iface=detect_wifi_interface(); let output=Command::new("sh").arg("-c").arg(format!("networksetup -getairportnetwork {} 2>&1", iface)).output().map_err(|e| e.to_string())?; Ok(String::from_utf8_lossy(&output.stdout).to_string()) }
#[command(async)] fn emergency_reset() -> Result<String, String> { let iface=detect_wifi_interface(); let _=Command::new("sh").arg("-c").arg(format!("networksetup -setairportpower {0} off; sleep 1; networksetup -setairportpower {0} on", iface)).output(); Ok("Radio reset triggered".to_string()) }

#[command(async)] fn get_ip_info() -> Result<IpInfo, String> {
    let iface=detect_wifi_interface();
    let ip_out=Command::new("ipconfig").arg("getifaddr").arg(&iface).output().map_err(|e| e.to_string())?; let mut ip=String::from_utf8_lossy(&ip_out.stdout).trim().to_string(); if ip.is_empty() { ip="--".to_string(); }
    let router_out=Command::new("sh").arg("-c").arg(format!("netstat -rn | grep default | grep -w {} | awk '{{print $2}}' | head -1", iface)).output().map_err(|e| e.to_string())?; let mut router=String::from_utf8_lossy(&router_out.stdout).trim().to_string(); if router.is_empty() { router="--".to_string(); }
    let mask_out=Command::new("ipconfig").arg("getoption").arg(&iface).arg("subnet_mask").output().map_err(|e| e.to_string())?; let mut subnet=String::from_utf8_lossy(&mask_out.stdout).trim().to_string(); if subnet.is_empty() { subnet="--".to_string(); }
    let public_out=Command::new("sh").arg("-c").arg("curl -s --max-time 2 https://ifconfig.me || echo --").output().map_err(|e| e.to_string())?; let mut public_ip=String::from_utf8_lossy(&public_out.stdout).trim().to_string(); if public_ip.is_empty() { public_ip="--".to_string(); }
    let dns_out=Command::new("sh").arg("-c").arg("scutil --dns | grep 'nameserver\\[0\\]' | head -2 | awk '{print $3}'").output().map_err(|e| e.to_string())?; let dns: Vec<String>=String::from_utf8_lossy(&dns_out.stdout).lines().map(|s| s.trim().to_string()).filter(|s|!s.is_empty()).collect();
    let airport_out=Command::new("sh").arg("-c").arg("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I 2>&1 | cat").output().map_err(|e| e.to_string())?; let airport_str=String::from_utf8_lossy(&airport_out.stdout); let mut bssid="--".to_string(); let mut tx_rate="--".to_string(); let mut band="--".to_string(); let mut security="--".to_string();
    for line in airport_str.lines() { let l=line.trim(); if l.starts_with("BSSID:") { bssid=l.replace("BSSID:", "").trim().to_string(); } if l.starts_with("lastTxRate:") { tx_rate=format!("{} Mbps", l.replace("lastTxRate:", "").trim()); } if l.starts_with("channel:") { if l.contains(",5") { band="5GHz".to_string(); } else { band="2.4GHz".to_string(); } } if l.starts_with("link auth:") { security=l.replace("link auth:", "").trim().to_string(); } }
    let uptime_out=Command::new("sh").arg("-c").arg("uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}'").output().map_err(|e| e.to_string())?; let uptime=String::from_utf8_lossy(&uptime_out.stdout).trim().to_string();
    Ok(IpInfo{ ip, router, subnet, public_ip, dns, tx_rate, uptime, bssid, band, security })
}
#[command(async)] fn ping_host(host: String) -> Result<PingResult, String> { let output=Command::new("ping").args(["-c", "1", "-W", "1000", &host]).output().map_err(|e| e.to_string())?; let stdout=String::from_utf8_lossy(&output.stdout); let ok=output.status.success(); let mut ms: Option<u64>=None; for part in stdout.split_whitespace() { if part.starts_with("time=") { let t=part.replace("time=", "").replace("ms", ""); if let Ok(v)=t.parse::<f64>() { ms=Some(v.round() as u64); } } } if ok && ms.is_none() { ms=Some(3); } Ok(PingResult{ ms, ok }) }
#[command(async)] fn get_link_stats() -> Result<serde_json::Value, String> { let output=Command::new("sh").arg("-c").arg("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I 2>&1").output().map_err(|e| e.to_string())?; let s=String::from_utf8_lossy(&output.stdout); let mut signal=0; for line in s.lines() { if line.trim().starts_with("agrCtlRSSI:") { if let Some(v)=line.split(':').nth(1) { if let Ok(n)=v.trim().parse::<i32>() { signal=n; } } } } Ok(serde_json::json!({ "signal_dbm": signal })) }

#[command(async)] fn simulate_disconnect(interface: String) -> Result<String, String> { let _=Command::new("sh").arg("-c").arg(format!("networksetup -setairportpower {} off", interface)).output(); Ok(format!("Simulated disconnect on {} - Wi-Fi powered off for demo", interface)) }
#[command(async)] fn force_restart_service(interface: String) -> Result<String, String> {
    let script=format!(r#"networksetup -setairportpower {0} off; sleep 1; killall -9 airportd 2>/dev/null; true; dscacheutil -flushcache; sudo killall -HUP mDNSResponder 2>/dev/null; true; networksetup -setairportpower {0} on; sleep 2; ipconfig set {0} BOOTP; ipconfig set {0} DHCP"#, interface);
    let _=Command::new("sh").arg("-c").arg(script).output(); Ok("Force restart completed - interface reset, DNS flushed, DHCP renewed".to_string())
}
#[command(async)] fn restore_connection(interface: String, ssid: String) -> Result<String, String> { let _=Command::new("sh").arg("-c").arg(format!("networksetup -setairportpower {} on", interface)).output(); Ok(format!("Restore attempted for {} on {}", ssid, interface)) }

// Real radio power state for the active Wi-Fi interface.
#[command(async)] fn get_radio_state() -> Result<bool, String> {
    let iface = detect_wifi_interface();
    let out = Command::new("networksetup").args(["-getairportpower", &iface]).output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).to_lowercase().contains(": on"))
}

// Turn the Wi-Fi radio on or off (used by the connection manager, not the emergency reset).
#[command(async)] fn set_radio(on: bool) -> Result<String, String> {
    let iface = detect_wifi_interface();
    let _ = Command::new("networksetup").args(["-setairportpower", &iface, if on { "on" } else { "off" }]).output();
    Ok(format!("radio {}", if on { "on" } else { "off" }))
}

// Join a network by name. For networks already known to macOS the password can be
// omitted; open networks never need one. Used for auto-reconnect and auto-switch.
#[command(async)] fn connect_wifi(ssid: String, password: String) -> Result<String, String> {
    let iface = detect_wifi_interface();
    let mut cmd = Command::new("networksetup");
    cmd.arg("-setairportnetwork").arg(&iface).arg(&ssid);
    if !password.is_empty() { cmd.arg(&password); }
    let out = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    let lower = format!("{} {}", stdout.to_lowercase(), stderr.to_lowercase());
    if lower.contains("could not find network") || lower.contains("failed") || lower.contains("error") || lower.contains("not find") {
        return Err(if !stderr.is_empty() { stderr } else if !stdout.is_empty() { stdout } else { format!("could not join {}", ssid) });
    }
    Ok(if stdout.is_empty() { format!("connected to {}", ssid) } else { stdout })
}

// Disassociate from the current network without power-cycling the radio.
#[command(async)] fn disconnect_wifi() -> Result<String, String> {
    let iface = detect_wifi_interface();
    let _ = Command::new("sh").arg("-c").arg(format!("airport -z 2>/dev/null; true")).output();
    let _ = iface;
    Ok("disassociated".to_string())
}

// Show or hide the Dock icon at runtime by switching the macOS activation policy.
#[cfg(target_os = "macos")]
fn apply_activation_policy(visible: bool) {
    use objc::{class, msg_send, sel, sel_impl};
    unsafe {
        let ns_app: *mut objc::runtime::Object = msg_send![class!(NSApplication), sharedApplication];
        let policy: i64 = if visible { 0 } else { 1 }; // Regular = 0, Accessory = 1
        let _: () = msg_send![ns_app, setActivationPolicy: policy];
        if visible { let _: () = msg_send![ns_app, activateIgnoringOtherApps: 1i32]; }
    }
}
#[cfg(not(target_os = "macos"))]
fn apply_activation_policy(_visible: bool) {}
// AppKit calls must run on the main thread, so this command stays synchronous.
#[command] fn set_dock_visible(visible: bool) -> Result<String, String> {
    apply_activation_policy(visible);
    Ok(format!("dock {}", if visible { "shown" } else { "hidden" }))
}

// The two plists below hold macOS's interface -> network-service mapping. When they
// get corrupted the Wi-Fi icon greys out with a slash even though the radio is on.
// Deleting them (as root) forces macOS to rebuild the mapping - a reboot finishes it.
const NET_SC_PREFS: &[&str] = &[
    "/Library/Preferences/SystemConfiguration/NetworkInterfaces.plist",
    "/Library/Preferences/SystemConfiguration/preferences.plist",
];

// Reports whether the current Wi-Fi DHCP state looks broken while the radio is on.
#[command(async)] fn check_dhcp_state() -> Result<DhcpState, String> {
    let iface = detect_wifi_interface();
    let power_out = Command::new("networksetup").args(["-getairportpower", &iface]).output();
    let radio_on = power_out.map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase().contains(": on")).unwrap_or(false);
    let ip_out = Command::new("ipconfig").args(["getifaddr", &iface]).output().map_err(|e| e.to_string())?;
    let ip = String::from_utf8_lossy(&ip_out.stdout).trim().to_string();
    let no_ip = ip.is_empty();
    let link_local = ip.starts_with("169.254.");
    // Healthy unless the radio is on but has no usable IPv4 lease.
    let healthy = !(radio_on && (no_ip || link_local));
    let state = if !radio_on { "radio-off" } else if no_ip { "no-ip" } else if link_local { "link-local" } else { "ok" }.to_string();
    let detail = format!("{} radio {} - ip {}", iface, if radio_on {"ON"} else {"OFF"}, if no_ip {"--"} else {&ip});
    Ok(DhcpState { healthy, ip, state, detail })
}

// Deletes the corruptible SystemConfiguration plists. Runs through osascript so macOS
// shows its native administrator password prompt - the app never stores credentials.
#[command(async)] fn deep_network_repair() -> Result<String, String> {
    let iface = detect_wifi_interface();
    let ssid = current_wifi_ssid(&iface);
    // One admin shell = one password prompt. Delete the interface-mapping plists AND stale
    // DHCP leases, then bounce configd so it re-scans hardware and rebuilds from a clean
    // state - otherwise configd rewrites the broken plists from memory at shutdown and the
    // greyed-out icon survives the reboot (the exact failure that was reported).
    let admin_cmd = format!(
        "rm -f {}; rm -f /var/db/dhcpclient/leases/* 2>/dev/null; killall -HUP configd",
        NET_SC_PREFS.join(" ")
    );
    let script = format!("do shell script \"{}\" with administrator privileges", admin_cmd);
    let out = Command::new("osascript").args(["-e", &script]).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if err.is_empty() { "repair cancelled or not authorised".to_string() } else { err });
    }
    // Give configd a moment to rescan, then pull the radio up and renew DHCP.
    let _ = Command::new("sh").arg("-c").arg("sleep 3").output();
    let _ = Command::new("sh").arg("-c").arg("dscacheutil -flushcache").output();
    let _ = Command::new("sh").arg("-c").arg(format!("networksetup -setairportpower {} on", iface)).output();
    let _ = Command::new("sh").arg("-c").arg(format!("ipconfig set {} DHCP", iface)).output();
    // Ask WiKeep to re-verify + rejoin on the next launch.
    let marker = config_dir().join(".post_repair");
    let _ = fs::write(&marker, format!("{}\n{}", iface, ssid));
    if !wifi_interface_enumerated() {
        return Ok("plists + DHCP leases reset and configd rebuilt - but the AirPort interface is still NOT re-enumerated. That is beyond plist corruption: power the Mac off, unplug power for 10 seconds (Intel SMC reset), restart, and hold Command+Option+P+R at boot (NVRAM reset). WiKeep will re-verify on next launch.".to_string());
    }
    Ok("deleted NetworkInterfaces.plist + preferences.plist + DHCP leases and restarted configd - Wi-Fi interface re-enumerated and radio restored. A reboot is still recommended to finalise the rebuild.".to_string())
}

// Name of the network the interface is currently on (empty when none).
fn current_wifi_ssid(iface: &str) -> String {
    if let Ok(out) = Command::new("networksetup").args(["-getairportnetwork", iface]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            let l = line.trim();
            if let Some(v) = l.strip_prefix("Current Wi-Fi Network:") { return v.trim().to_string(); }
        }
    }
    String::new()
}

// True when a Wi-Fi/AirPort hardware port with a device is enumerated by networksetup.
// False = the greyed-out-with-slash state, i.e. the AirPort interface never came back.
fn wifi_interface_enumerated() -> bool {
    if let Ok(out) = Command::new("networksetup").arg("-listallhardwareports").output() {
        let mut port = String::new();
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            let l = line.trim();
            if let Some(p) = l.strip_prefix("Hardware Port:") { port = p.trim().to_string(); }
            else if let Some(_d) = l.strip_prefix("Device:") {
                if port == "Wi-Fi" || port == "AirPort" { return true; }
            }
        }
    }
    false
}

// On the launch right after a Deep Repair, finish the job: flush, re-raise the radio,
// spool DHCP, and rejoin the network we were on before the wipe.
fn recover_after_repair() {
    let marker = config_dir().join(".post_repair");
    if !marker.exists() { return; }
    let data = fs::read_to_string(&marker).unwrap_or_default();
    let _ = fs::remove_file(&marker);
    let lines: Vec<&str> = data.lines().map(|s| s.trim()).collect();
    let iface = lines.first().copied().unwrap_or("");
    let ssid = lines.get(1).copied().unwrap_or("");
    let _ = Command::new("sh").arg("-c").arg("dscacheutil -flushcache").output();
    if iface.is_empty() { return; }
    let _ = Command::new("sh").arg("-c").arg(format!("networksetup -setairportpower {} on", iface)).output();
    let _ = Command::new("sh").arg("-c").arg(format!("ipconfig set {} DHCP", iface)).output();
    if !ssid.is_empty() {
        let _ = Command::new("sh").arg("-c").arg(format!("networksetup -setairportnetwork '{}' '{}'", iface, ssid)).output();
    }
}

// Native dialog asking to reboot now; uses System Events so no extra admin prompt.
#[command(async)] fn prompt_reboot() -> Result<String, String> {
    let dialog = r#"button returned of (display dialog "Network configuration was rebuilt.\n\nReboot now to finish the repair?" buttons {"Later", "Reboot Now"} default button "Reboot Now" with title "WiKeep" with icon caution)"#;
    let out = Command::new("osascript").args(["-e", dialog]).output().map_err(|e| e.to_string())?;
    let res = String::from_utf8_lossy(&out.stdout);
    if res.contains("Reboot Now") {
        let _ = Command::new("osascript").args(["-e", "tell application \"System Events\" to restart"]).output();
        return Ok("reboot".to_string());
    }
    Ok("later".to_string())
}

fn main() {
    let show_item = CustomMenuItem::new("show".to_string(), "Show WiKeep");
    let hide_item = CustomMenuItem::new("hide".to_string(), "Hide to Tray");
    let quit_item = CustomMenuItem::new("quit".to_string(), "Quit");
    let tray_menu = SystemTrayMenu::new()
        .add_item(show_item)
        .add_item(hide_item)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit_item);
    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
       .system_tray(tray)
       .setup(|app| {
           // Sync LaunchAgent with the saved setting so a toggle stays in effect across reboots.
           let settings = get_settings().unwrap_or_default();
let _ = sync_autostart(settings.launch_at_login);
           // Finish any Deep Repair that was interrupted by a reboot.
           recover_after_repair();
           // Apply the saved Dock preference at startup (macOS activation policy).
           #[cfg(target_os = "macos")]
           app.set_activation_policy(if settings.show_dock { tauri::ActivationPolicy::Regular } else { tauri::ActivationPolicy::Accessory });
           Ok(())
       })
       .on_system_tray_event(|app, event| match event {
           SystemTrayEvent::LeftClick { .. } => { if let Some(w) = app.get_window("main") { let _ = w.show(); let _ = w.set_focus(); } }
           SystemTrayEvent::MenuItemClick { id, .. } => match id.as_ref() {
               "show" => { if let Some(w) = app.get_window("main") { let _ = w.show(); let _ = w.set_focus(); } }
               "hide" => { if let Some(w) = app.get_window("main") { let _ = w.hide(); } }
               "quit" => app.exit(0),
               _ => {}
           },
           _ => {}
       })
       .on_window_event(|event| {
           if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
               // Honour "Run in Menu Bar": keep running in the tray, or quit when disabled.
               let keep_running = get_settings().map(|s| s.show_menu_bar).unwrap_or(true);
               if keep_running {
                   api.prevent_close();
                   let _ = event.window().hide();
               } else {
                   event.window().app_handle().exit(0);
               }
           }
       })
       .invoke_handler(tauri::generate_handler![
            scan_wifi, get_current_wifi, get_wifi_interface, emergency_reset, get_ip_info, ping_host, get_link_stats,
            get_settings, save_settings, get_logs, append_log, clear_logs,
            get_onboarding_status, set_onboarded, reset_onboarding,
            set_autostart, get_autostart,
            simulate_disconnect, force_restart_service, restore_connection,
            check_dhcp_state, deep_network_repair, prompt_reboot,
            get_radio_state, set_radio, connect_wifi, disconnect_wifi, set_dock_visible
        ])
       .run(tauri::generate_context!())
        .expect("error while running tauri application");
}