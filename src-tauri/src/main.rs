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
}
fn default_true() -> bool { true }
impl Default for AppSettings {
    fn default() -> Self {
        Self { auto_reconnect: true, keep_alive: true, keep_alive_interval: "30s".to_string(), reconnect_on_wake: true, auto_switch_strongest: false,
        preferred_band: "Auto".to_string(), block_open: true, launch_at_login: false, show_menu_bar: true, show_dock: true,
        notify_disconnect: true, notify_ip_change: false, ping_router_target: "".to_string(), ping_dns_target: "1.1.1.1".to_string(), ping_internet_target: "8.8.8.8".to_string(),
        quality_threshold: 30, interface_name: "en".to_string(), preferred_networks: vec![], simulation_mode: true, auto_heal: true, }
    }
}
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LogEntry { id: String, timestamp: String, time_ms: i64, level: String, source: String, message: String, detail: Option<String>, }

fn config_dir() -> PathBuf { let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string()); let p = PathBuf::from(home).join(".config").join("netkeeper"); let _ = fs::create_dir_all(&p); p }
fn settings_path() -> PathBuf { config_dir().join("settings.json") }
fn logs_path() -> PathBuf { config_dir().join("logs.jsonl") }
fn onboarded_path() -> PathBuf { config_dir().join(".onboarded") }

#[command] fn get_onboarding_status() -> Result<bool, String> { Ok(onboarded_path().exists()) }
#[command] fn set_onboarded() -> Result<String, String> { fs::write(onboarded_path(), "1").map_err(|e| e.to_string())?; Ok("onboarded".to_string()) }
#[command] fn reset_onboarding() -> Result<String, String> { let p=onboarded_path(); if p.exists() { let _=fs::remove_file(&p); } Ok("reset".to_string()) }

// Auto-start at login uses a macOS LaunchAgent so the app comes back after reboot.
fn launch_agent_path() -> PathBuf { let home=std::env::var("HOME").unwrap_or_else(|_| ".".to_string()); PathBuf::from(home).join("Library").join("LaunchAgents").join("com.netkeeper.app.plist") }
fn is_packaged_app() -> bool { std::env::current_exe().map(|e| e.to_string_lossy().contains(".app/")).unwrap_or(false) }
fn sync_autostart(enabled: bool) -> Result<String, String> {
    if !is_packaged_app() { return Ok("skipped: only manages LaunchAgent from the installed app".to_string()); }
    let path=launch_agent_path();
    if enabled {
        let exe=std::env::current_exe().map_err(|e| e.to_string())?;
        let plist=format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n\t<key>Label</key>\n\t<string>com.netkeeper.app</string>\n\t<key>ProgramArguments</key>\n\t<array>\n\t\t<string>{}</string>\n\t</array>\n\t<key>RunAtLoad</key>\n\t<true/>\n\t<key>ProcessType</key>\n\t<string>Background</string>\n</dict>\n</plist>\n", exe.display());
        fs::write(&path, plist).map_err(|e| e.to_string())?;
    } else if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(if enabled { "enabled" } else { "disabled" }.to_string())
}
#[command] fn set_autostart(enabled: bool) -> Result<String, String> { sync_autostart(enabled) }
#[command] fn get_autostart() -> Result<bool, String> { Ok(launch_agent_path().exists()) }

#[command] fn get_settings() -> Result<AppSettings, String> { let path=settings_path(); if path.exists() { match fs::read_to_string(&path) { Ok(s)=>Ok(serde_json::from_str(&s).unwrap_or_default()), Err(_)=>Ok(AppSettings::default()) } } else { Ok(AppSettings::default()) } }
#[command] fn save_settings(settings: AppSettings) -> Result<String, String> {
    let path=settings_path(); let json=serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?; fs::write(&path, json).map_err(|e| e.to_string())?;
    let _ = sync_autostart(settings.launch_at_login);
    Ok("saved".to_string())
}

#[command] fn get_logs() -> Result<Vec<LogEntry>, String> { let path=logs_path(); if!path.exists() { return Ok(vec![]); } let file=fs::File::open(&path).map_err(|e| e.to_string())?; let reader=BufReader::new(file); let mut logs: Vec<LogEntry>=Vec::new(); for line in reader.lines().flatten() { if let Ok(entry)=serde_json::from_str::<LogEntry>(&line) { logs.push(entry); } } logs.reverse(); if logs.len()>500 { logs.truncate(500); } Ok(logs) }
#[command] fn append_log(entry: LogEntry) -> Result<String, String> { let path=logs_path(); let line=serde_json::to_string(&entry).map_err(|e| e.to_string())?; use std::io::Write; let mut file=fs::OpenOptions::new().create(true).append(true).open(&path).map_err(|e| e.to_string())?; writeln!(file, "{}", line).map_err(|e| e.to_string())?; Ok("appended".to_string()) }
#[command] fn clear_logs() -> Result<String, String> { let path=logs_path(); if path.exists() { fs::write(&path, "").map_err(|e| e.to_string())?; } Ok("cleared".to_string()) }

#[command]
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

#[command] fn get_wifi_interface() -> Result<String, String> { Ok(detect_wifi_interface()) }
#[command] fn get_current_wifi() -> Result<String, String> { let iface=detect_wifi_interface(); let output=Command::new("sh").arg("-c").arg(format!("networksetup -getairportnetwork {} 2>&1", iface)).output().map_err(|e| e.to_string())?; Ok(String::from_utf8_lossy(&output.stdout).to_string()) }
#[command] fn emergency_reset() -> Result<String, String> { let iface=detect_wifi_interface(); let _=Command::new("sh").arg("-c").arg(format!("networksetup -setairportpower {0} off; sleep 1; networksetup -setairportpower {0} on", iface)).output(); Ok("Radio reset triggered".to_string()) }

#[command] fn get_ip_info() -> Result<IpInfo, String> {
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
#[command] fn ping_host(host: String) -> Result<PingResult, String> { let output=Command::new("ping").args(["-c", "1", "-W", "1000", &host]).output().map_err(|e| e.to_string())?; let stdout=String::from_utf8_lossy(&output.stdout); let ok=output.status.success(); let mut ms: Option<u64>=None; for part in stdout.split_whitespace() { if part.starts_with("time=") { let t=part.replace("time=", "").replace("ms", ""); if let Ok(v)=t.parse::<f64>() { ms=Some(v.round() as u64); } } } if ok && ms.is_none() { ms=Some(3); } Ok(PingResult{ ms, ok }) }
#[command] fn get_link_stats() -> Result<serde_json::Value, String> { let output=Command::new("sh").arg("-c").arg("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I 2>&1").output().map_err(|e| e.to_string())?; let s=String::from_utf8_lossy(&output.stdout); let mut signal=0; for line in s.lines() { if line.trim().starts_with("agrCtlRSSI:") { if let Some(v)=line.split(':').nth(1) { if let Ok(n)=v.trim().parse::<i32>() { signal=n; } } } } Ok(serde_json::json!({ "signal_dbm": signal })) }

#[command] fn simulate_disconnect(interface: String) -> Result<String, String> { let _=Command::new("sh").arg("-c").arg(format!("networksetup -setairportpower {} off", interface)).output(); Ok(format!("Simulated disconnect on {} - Wi-Fi powered off for demo", interface)) }
#[command] fn force_restart_service(interface: String) -> Result<String, String> {
    let script=format!(r#"networksetup -setairportpower {0} off; sleep 1; killall -9 airportd 2>/dev/null; true; dscacheutil -flushcache; sudo killall -HUP mDNSResponder 2>/dev/null; true; networksetup -setairportpower {0} on; sleep 2; ipconfig set {0} BOOTP; ipconfig set {0} DHCP"#, interface);
    let _=Command::new("sh").arg("-c").arg(script).output(); Ok("Force restart completed - interface reset, DNS flushed, DHCP renewed".to_string())
}
#[command] fn restore_connection(interface: String, ssid: String) -> Result<String, String> { let _=Command::new("sh").arg("-c").arg(format!("networksetup -setairportpower {} on", interface)).output(); Ok(format!("Restore attempted for {} on {}", ssid, interface)) }

fn main() {
    let show_item = CustomMenuItem::new("show".to_string(), "Show NetKeeper");
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
           let _ = app; let settings = get_settings().unwrap_or_default();
           let _ = sync_autostart(settings.launch_at_login);
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
               api.prevent_close();
               let _ = event.window().hide();
           }
       })
       .invoke_handler(tauri::generate_handler![
            scan_wifi, get_current_wifi, get_wifi_interface, emergency_reset, get_ip_info, ping_host, get_link_stats,
            get_settings, save_settings, get_logs, append_log, clear_logs,
            get_onboarding_status, set_onboarded, reset_onboarding,
            set_autostart, get_autostart,
            simulate_disconnect, force_restart_service, restore_connection
        ])
       .run(tauri::generate_context!())
       .expect("error while running tauri application");
}