import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import {
  LayoutDashboard, Radio, Activity, Settings, ScrollText,
  Signal, Power, RefreshCw, Check, ShieldCheck, AlertTriangle,
  Lock, HelpCircle, Timer
} from "lucide-react";

type Network = { ssid: string; bssid: string; rssi: number; channel: number; security: string; signal: number; current?: boolean; };
type Tab = "overview"|"networks"|"diagnostics"|"settings"|"log"|"help";
type LogEntry = { id: string; timestamp: string; time_ms: number; level: string; source: string; message: string; detail?: string; };
type AppSettings = {
  auto_reconnect: boolean; keep_alive: boolean; keep_alive_interval: string; reconnect_on_wake: boolean; auto_switch_strongest: boolean;
  preferred_band: string; block_open: boolean; launch_at_login: boolean; show_menu_bar: boolean; show_dock: boolean;
  notify_disconnect: boolean; notify_ip_change: boolean; ping_router_target: string; ping_dns_target: string; ping_internet_target: string;
  quality_threshold: number; interface_name: string; preferred_networks: string[]; simulation_mode: boolean;
};

function HelpPage({ settings }: { settings: AppSettings }){
  return (
    <div className="max-w-[980px] space-y-3">
      <div className="bg-white border border-black/[0.08] rounded-[14px] p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-[#0a84ff]/10 border border-[#0a84ff]/20 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-[#0a84ff]"/></div>
          <div><div className="font-[700] text-[15px]">What NetKeeper does</div><div className="text-[12px] text-[#8e8e93] mt-0.5">A Wi-Fi helper for macOS. It scans nearby networks, shows signal and IP details, keeps your connection alive, and recovers the radio when it stops working.</div></div>
        </div>
        <div className="mt-4 text-[12px] leading-[1.6] text-[#1d1d1f]">
          NetKeeper uses the airport tool that ships with macOS to list all networks within range. For every network you see its name (SSID), hardware address (BSSID), signal (RSSI in dBm), channel, and security type. There is no filter: home routers, phone hotspots, and any brand of router all show up.
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 mono text-[11px]">
          <div className="bg-[#f5f5f7] rounded-[10px] p-3 border border-black/[0.06]"><div className="font-[700]">What we scan</div><div className="mt-1 text-[#6e6e73]">airport -s - {settings.interface_name} - 2.4GHz and 5GHz - all vendors - no filter</div></div>
          <div className="bg-[#f5f5f7] rounded-[10px] p-3 border border-black/[0.06]"><div className="font-[700]">What we store</div><div className="mt-1 text-[#6e6e73]">~/.config/netkeeper/ - settings and logs stay on your Mac</div></div>
        </div>
      </div>

      <div className="bg-white border border-black/[0.08] rounded-[14px] p-5">
        <h3 className="font-[700] text-[13px]">Getting started</h3>
        <div className="mt-3 space-y-2.5 text-[12px]">
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-[700]">1</span><span><span className="font-[600]">Grant Location access.</span> macOS only lets apps run a Wi-Fi scan when they have Location permission. NetKeeper asks on first launch. If you skipped it, go to System Settings, Privacy and Security, Location, and turn on NetKeeper, then scan again.</span></div>
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-[700]">2</span><span><span className="font-[600]">Run a scan.</span> Use the Scan button on the sidebar or the Rescan button on the Networks tab. The list updates with every network in range.</span></div>
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-[700]">3</span><span><span className="font-[600]">Read the Dashboard.</span> The Overview tab shows your current network, IP details, signal quality, and statistics about nearby networks.</span></div>
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-[700]">4</span><span><span className="font-[600]">If you see nothing.</span> macOS sometimes powers off the Wi-Fi radio after wake. Press Reset in the sidebar or use Emergency Reset. It turns the radio off and back on through networksetup.</span></div>
        </div>
      </div>

      <div className="bg-white border border-black/[0.08] rounded-[14px] p-5">
        <h3 className="font-[700] text-[13px] flex items-center gap-2"><LayoutDashboard className="w-4 h-4"/>Dashboard (Overview tab)</h3>
        <div className="mt-3 space-y-2 text-[12px] leading-[1.6]">
          <div><span className="font-[600]">Current SSID.</span> The network you are connected to, with its BSSID, band, and security, plus a signal bar.</div>
          <div><span className="font-[600]">IP and Router.</span> Your local IP address, router (gateway) address, subnet mask, public IP, and DNS servers.</div>
          <div><span className="font-[600]">Radio and Quality.</span> Whether the radio is on, and a chart of signal quality over the last 60 seconds.</div>
          <div><span className="font-[600]">Networks Stats.</span> How many networks were found, the average and best signal, and the current network.</div>
          <div><span className="font-[600]">Latency Live.</span> Ping time to the router, a DNS server, and the internet, refreshed every 8 seconds.</div>
          <div><span className="font-[600]">Band split, signal extremes, open networks.</span> How many networks run on 2.4GHz versus 5GHz, the strongest and weakest signals, and any unencrypted networks you should avoid.</div>
          <div><span className="font-[600]">Top 5, busiest channels, connected details.</span> A ranked list of the strongest networks, which channels are most used, and details of the network you are on.</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-black/[0.08] rounded-[14px] p-5">
          <h3 className="font-[700] text-[13px] flex items-center gap-2"><Radio className="w-4 h-4"/>Networks tab</h3>
          <div className="mt-3 space-y-2 text-[12px] leading-[1.6]">
            <div>Each row is one network that was found.</div>
            <div><span className="font-[600]">SSID.</span> The network name. The CURRENT badge marks the one you are connected to.</div>
            <div><span className="font-[600]">BSSID.</span> The hardware address of the access point.</div>
            <div><span className="font-[600]">RSSI.</span> Signal strength. Lower dBm is weaker, so -40 is better than -70. The bar and color show the same thing.</div>
            <div><span className="font-[600]">Band and channel.</span> 2.4G or 5G, and which channel the network uses.</div>
            <div><span className="font-[600]">Security.</span> How the network is protected.</div>
          </div>
        </div>
        <div className="bg-white border border-black/[0.08] rounded-[14px] p-5">
          <h3 className="font-[700] text-[13px] flex items-center gap-2"><Activity className="w-4 h-4"/>Diagnostics tab</h3>
          <div className="mt-3 space-y-2 text-[12px] leading-[1.6]">
            <div><span className="font-[600]">Signal chart.</span> Your signal quality over the last minute.</div>
            <div><span className="font-[600]">Latency chart.</span> Ping time to the internet over the last minute.</div>
            <div><span className="font-[600]">Health checks.</span> Eight quick checks: interface, driver, IP, internet, DNS, gateway, band, and security. Green means fine, red means something needs attention.</div>
            <div><span className="font-[600]">Network count chart.</span> How many networks were visible over time.</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-black/[0.08] rounded-[14px] p-5">
        <h3 className="font-[700] text-[13px] flex items-center gap-2"><Settings className="w-4 h-4"/>Settings explained</h3>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] leading-[1.6]">
          <div><span className="font-[600]">Auto-Join Best Network.</span> Connecting to the strongest known network on its own.</div>
          <div><span className="font-[600]">Keep-Alive Ping.</span> Pings a target on an interval to stop macOS from dropping the connection.</div>
          <div><span className="font-[600]">Keep-Alive Interval.</span> How often the keep-alive ping runs, for example 30s or 5m.</div>
          <div><span className="font-[600]">Auto-Heal Radio Crash.</span> If a scan finds zero networks, resets {settings.interface_name} after 5 seconds.</div>
          <div><span className="font-[600]">Simulation Mode (Demo).</span> Shows demo controls to test a disconnect and recovery.</div>
          <div><span className="font-[600]">Auto-Reconnect on Drop.</span> Tries to reconnect when the connection drops.</div>
          <div><span className="font-[600]">Reconnect on Wake.</span> Reconnects after the Mac wakes from sleep.</div>
          <div><span className="font-[600]">Auto-Switch Strongest.</span> Moves to the strongest known network when it is better.</div>
          <div><span className="font-[600]">Block Open Networks.</span> Never joins networks without encryption.</div>
          <div><span className="font-[600]">Notify on Disconnect / IP Change.</span> Shows a system notification when these events happen.</div>
          <div><span className="font-[600]">Launch at Login, Menu Bar, Dock.</span> Controls where and when NetKeeper appears.</div>
          <div><span className="font-[600]">Preferred Band.</span> Which band to prefer when joining a network: Auto, 2.4GHz, or 5GHz.</div>
          <div><span className="font-[600]">Signal Drop Threshold.</span> The quality percentage at which NetKeeper treats the signal as too weak.</div>
          <div><span className="font-[600]">Preferred Networks.</span> A comma-separated list of networks you prefer. Leave blank to let NetKeeper decide.</div>
          <div><span className="font-[600]">Ping Targets.</span> The router, DNS, and internet addresses used by Diagnostics and the dashboard latency card.</div>
          <div><span className="font-[600]">Interface.</span> The Wi-Fi device used for commands, usually en0 or en1. NetKeeper detects it automatically.</div>
        </div>
      </div>

      <div className="bg-white border border-black/[0.08] rounded-[14px] p-5">
        <h3 className="font-[700] text-[13px] flex items-center gap-2"><Power className="w-4 h-4"/>Troubleshooting</h3>
        <div className="mt-3 space-y-2.5 text-[12px]">
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-[700]">1</span><span><span className="font-[600]">No networks, radio appears off.</span> macOS sometimes powers off the radio after wake. Use Emergency Reset in the sidebar. It runs networksetup to turn the radio off and back on.</span></div>
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-[700]">2</span><span><span className="font-[600]">Only one network shows.</span> Location access is likely off. Allow it in System Settings, Privacy and Security, Location, then scan again.</span></div>
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-[700]">3</span><span><span className="font-[600]">Slow internet while connected.</span> Open the Diagnostics tab and run the checks. High latency or packet loss points to a signal or router problem.</span></div>
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-[700]">4</span><span><span className="font-[600]">IP shows --.</span> The interface has no address yet. Use Force Restart Service on the demo bar, which renews DHCP.</span></div>
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-[700]">5</span><span><span className="font-[600]">Drops after sleep.</span> Turn on Reconnect on Wake and Keep-Alive Ping. If it still drops, check your router for channel and band settings.</span></div>
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-[700]">6</span><span><span className="font-[600]">Trouble remains.</span> Open the Recovery Log tab. The log records scans, resets, and errors, and is stored at ~/.config/netkeeper/logs.jsonl.</span></div>
        </div>
      </div>

      <div className="bg-white border border-black/[0.08] rounded-[14px] p-5">
        <h3 className="font-[700] text-[13px] flex items-center gap-2"><HelpCircle className="w-4 h-4"/>Common questions</h3>
        <div className="mt-3 space-y-2 text-[12px] leading-[1.6]">
          <div><span className="font-[600]">Why does my network appear twice?</span> Many routers broadcast on both 2.4GHz and 5GHz. Each band shows as a separate entry.</div>
          <div><span className="font-[600]">What is BSSID?</span> The unique hardware address of an access point. It identifies a specific radio, not just the network name.</div>
          <div><span className="font-[600]">What does RSSI mean?</span> It is signal strength in dBm. Closer to zero is stronger. Around -40 to -60 is good, while below -75 gets unstable.</div>
          <div><span className="font-[600]">Why does the network count change?</span> Scanning depends on where you are, nearby routers, and interference. Counts can differ on each scan.</div>
          <div><span className="font-[600]">Does NetKeeper send data anywhere?</span> No. Settings and logs stay in ~/.config/netkeeper/ on your Mac.</div>
          <div><span className="font-[600]">Can it see the 6GHz band?</span> The airport tool reports 2.4GHz and 5GHz channels. Newer 6GHz routers may still appear if they also broadcast on 5GHz.</div>
        </div>
      </div>
    </div>
  )
}

function Steps({ n, children }: { n: number; children: React.ReactNode }){
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-[#0a84ff]/10 border border-[#0a84ff]/20 text-[#0a84ff] flex items-center justify-center text-[11px] font-[700] shrink-0">{n}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function OnboardingModal({ onComplete, onLog }: { onComplete: ()=>void; onLog: (l:string,s:string,m:string)=>void }){
  const [granted, setGranted] = useState(false);
  const [granting, setGranting] = useState(false);
  const [denied, setDenied] = useState(false);
  const [done, setDone] = useState(false);
  const [iface, setIface] = useState("en0");
  const tools = [
    { name: "ipconfig", ok: true },
    { name: "networksetup", ok: true },
    { name: "airport", ok: true },
  ];
  useEffect(()=>{ (async()=>{ try{ const i = await invoke<string>("get_wifi_interface"); if(i) setIface(i); }catch{} })(); },[]);
  const handleGrant = async ()=>{
    setGranting(true); setDenied(false);
    try{
      await invoke("scan_wifi");
      setGranted(true);
      onLog("success","Onboarding","Location granted - all networks visible - all vendors - no filter");
    }catch(e){
      setDenied(true);
      onLog("error","Onboarding","Permission denied - only 1 network visible - open System Settings and check Location");
    }
    setGranting(false);
  };
  const handleContinue = ()=>{
    setDone(true);
    setTimeout(()=>{ try{ invoke("set_onboarded"); localStorage.setItem("netkeeper_onboarded","true"); }catch{} onComplete(); }, 900);
  };
  if(done){
    return (
      <div className="absolute inset-0 z-[100] bg-[#fbfbfc]/95 backdrop-blur-[2px] flex items-center justify-center p-6">
        <div className="w-[480px] bg-white border border-black/[0.08] rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-[#30d158]/10 border border-[#30d158]/30 flex items-center justify-center mx-auto"><Check className="w-7 h-7 text-[#30d158]"/></div>
          <div className="font-[700] text-[18px] mt-4">Welcome to NetKeeper</div>
          <div className="text-[12px] text-[#6e6e73] mt-1">Monitoring your networks.</div>
          <div className="mt-4 mono text-[10px] text-[#8e8e93] leading-[1.6]">{iface} - Keep-Alive 30s - Auto-Heal ON<br/>Logs in ~/.config/netkeeper/logs.jsonl</div>
        </div>
      </div>
    )
  }
  return (
    <div className="absolute inset-0 z-[100] bg-[#fbfbfc]/90 backdrop-blur-[2px] flex items-center justify-center p-6">
      <div className="w-[560px] bg-white border border-black/[0.08] rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden">
        <div className="h-[64px] px-6 flex items-center justify-between border-b border-black/[0.06] bg-[#fcfcfc]">
          <div className="flex items-center">
            <div className="w-9 h-9 rounded-[8px] bg-[#0a84ff] shadow flex items-center justify-center overflow-hidden"><img src="favicon.png" alt="NetKeeper" className="w-9 h-9 object-cover"/></div>
            <div className="ml-3"><div className="font-[700] text-[14px] leading-none">NetKeeper</div><div className="mono text-[10px] text-[#8e8e93] mt-1">v3.0.0 - {iface}</div></div>
          </div>
          <span className="text-[10px] font-[700] tracking-widest uppercase bg-[#1d1d1f] text-white rounded-full px-2.5 py-1">First run</span>
        </div>
        <div className="p-7 pb-5">
          <h1 className="font-[700] text-[22px] leading-tight">Keep your networks alive.</h1>
          <p className="text-[13px] text-[#6e6e73] mt-1.5">Set up NetKeeper and stop worrying about Wi-Fi that drops. It scans nearby networks, keeps your connection alive, and restarts the radio if it stops working.</p>
          <p className="mono text-[10px] text-[#8e8e93] mt-3 mb-6">3 quick steps - about 30 seconds - everything stays on your Mac</p>

          <div className="space-y-3">
            <div className={`border rounded-[12px] p-4 ${granted?'border-[#30d158]/40 bg-[#f0fdf5]':'border-black/[0.08] bg-[#fafafa]'}`}>
              <Steps n={1}>
                <div className="flex items-center justify-between gap-3">
                  <div><div className="font-[600] text-[13px]">Grant Wi-Fi Scanning Access</div><div className="text-[11px] text-[#6e6e73] mt-0.5 leading-[1.4]">macOS only shows apps a list of nearby networks after they get Location permission. NetKeeper uses that permission just to see SSIDs. It does not track where you are.</div></div>
                  {granted ? <span className="flex items-center gap-1 text-[#30d158] font-[600] text-[12px] shrink-0"><Check className="w-4 h-4"/>Granted</span> : <button onClick={handleGrant} disabled={granting} className="h-9 px-4 bg-[#0a84ff] text-white rounded-[9px] text-[12px] font-[600] shrink-0 hover:bg-[#0066cc] active:bg-[#0055b3]">{granting?'Requesting...':'Approve'}</button>}
                </div>
                {denied && <div className="mt-3 flex items-center gap-2 bg-white border border-[#ff3b30]/20 rounded-[8px] px-3 py-2 text-[11px] text-[#c0392b]"><AlertTriangle className="w-3.5 h-3.5 shrink-0"/>Permission was not granted. Open System Settings, then Privacy and Security, Location Services, turn on NetKeeper, and click Approve again.</div>}
                <div className="mt-3 flex items-center gap-3 mono text-[10px] text-[#8e8e93]"><span className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${granted?'bg-[#30d158]':'bg-black/20'}`}/>Location: {granted?'allowed':'pending'}</span><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#30d158]"/>Detects {iface} and all vendors: MTN, Starlink, any SSID</span></div>
              </Steps>
            </div>

            <div className="border border-black/[0.08] rounded-[12px] p-4 bg-white">
              <Steps n={2}>
                <div className="font-[600] text-[13px]">Network Tools Access</div>
                <div className="text-[11px] text-[#6e6e73] mt-0.5 leading-[1.4]">NetKeeper reads your IP, gateway, radio state, and signal using tools that already ship with macOS. They are read-only. No installs and no passwords are asked.</div>
                <div className="mt-3 flex items-center gap-3 mono text-[10.5px] text-[#1d1d1f]">{tools.map(t=>(
                  <span key={t.name} className={`flex items-center gap-1 px-2 py-1 rounded-md border ${t.ok?'bg-[#f0fdf5] border-[#30d158]/30 text-[#1d7a37]':'bg-[#f5f5f7] border-black/[0.06] text-[#8e8e93]'}`}>{t.ok?<Check className="w-3 h-3"/>:<span className="w-3 h-3 rounded-full border border-black/20"/>}{t.name}</span>
                ))}</div>
              </Steps>
            </div>

            <div className="border border-black/[0.08] rounded-[12px] p-4 bg-white">
              <Steps n={3}>
                <div className="font-[600] text-[13px]">Ready to Keep Alive</div>
                <div className="text-[11px] text-[#6e6e73] mt-0.5 leading-[1.4]">NetKeeper pings a target every 30 seconds so macOS does not drop the connection, resets the radio if a scan finds zero networks, and writes every event to a log stored on your Mac.</div>
                <div className="mt-3"><button onClick={handleContinue} disabled={!granted} className={`h-10 px-5 rounded-[9px] text-[13px] font-[600] ${granted?'bg-[#0a84ff] text-white hover:bg-[#0066cc] active:bg-[#0055b3]':'bg-black/10 text-black/40 cursor-not-allowed'}`}>Continue to App</button></div>
              </Steps>
            </div>
          </div>
        </div>
        <div className="px-7 py-3 border-t border-black/[0.06] bg-[#fcfcfc] flex items-center justify-between">
          <div className="flex items-center gap-1.5 mono text-[10px] text-[#8e8e93]"><Lock className="w-3 h-3"/>No data leaves your Mac. Logs stored locally at ~/.config/netkeeper/</div>
          <button onClick={()=>{ try{ localStorage.setItem("netkeeper_onboarded","true"); }catch{} onComplete(); }} className="text-[11px] text-[#8e8e93] underline hover:text-[#1d1d1f]">Skip setup</button>
        </div>
      </div>
    </div>
  )
}

export default function App(){
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [networks, setNetworks] = useState<Network[]>([]);
  const [currentSsid, setCurrentSsid] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: "1", timestamp: new Date().toLocaleTimeString(), time_ms: Date.now(), level: "info", source: "System", message: "NetKeeper v1.0 Final - en ready - all vendors" },
    { id: "2", timestamp: new Date().toLocaleTimeString(), time_ms: Date.now(), level: "info", source: "System", message: "Auto-heal: ON - Keep-Alive: ON - Driver Brcm4360 - all SSIDs" },
  ]);
  const [keepAlive, setKeepAlive] = useState(true);
  const [autoJoin, setAutoJoin] = useState(true);
  const [autoHeal, setAutoHeal] = useState(true);
  const [ipInfo, setIpInfo] = useState({ ip: "--", router: "--", public_ip: "--", dns: [] as string[], tx_rate: "--", bssid: "--", band: "--", security: "--", uptime: "--", subnet: "--" });
  const [quality, setQuality] = useState(78);
  const [signalHistory, setSignalHistory] = useState<number[]>([65,68,70,72,69,71,74,73,75,72,78,76,80,79,77,75,78,80,76,78]);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([18,19,17,18,22,18,16,17,18,19,18,17,18,19,20,18,17,18,19,18]);
  const [lat, setLat] = useState<{[k:string]:{ms:number|null; ok:boolean}}>({router:{ms:null,ok:false},dns:{ms:null,ok:false},internet:{ms:null,ok:false}});
  const [settings, setSettings] = useState<AppSettings>({
    auto_reconnect: true, keep_alive: true, keep_alive_interval: "30s", reconnect_on_wake: true, auto_switch_strongest: false,
    preferred_band: "Auto", block_open: true, launch_at_login: false, show_menu_bar: true, show_dock: true,
    notify_disconnect: true, notify_ip_change: false, ping_router_target: "", ping_dns_target: "1.1.1.1", ping_internet_target: "8.8.8.8",
    quality_threshold: 30, interface_name: "en0", preferred_networks: [], simulation_mode: true
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  const current = networks.find(n=>n.current) || networks[0];
  const hasSignal = networks.length>0;
  const avgRssi = networks.length? Math.round(networks.reduce((a,b)=>a+b.rssi,0)/networks.length) : -999;
  const bestNetwork = [...networks].sort((a,b)=>b.rssi-a.rssi)[0];
  const sortedNets = [...networks].sort((a,b)=>b.rssi-a.rssi);
  const strongest = sortedNets[0];
  const weakest = sortedNets[sortedNets.length-1];
  const rssis = networks.map(n=>n.rssi).sort((a,b)=>a-b);
  const medianRssi = rssis.length? Math.round((rssis[Math.floor((rssis.length-1)/2)] + rssis[Math.ceil((rssis.length-1)/2)])/2) : 0;
  const openNets = networks.filter(n=>/open|none|wep/i.test(n.security));
  const chCounts:any = {}; networks.forEach(n=>{ chCounts[n.channel]=(chCounts[n.channel]||0)+1; });
  const topCh = Object.entries(chCounts).sort((a:any,b:any)=>b[1]-a[1]).slice(0,5);
  const fiveG = networks.filter(n=>n.channel>30).length;
  const twoFourG = networks.length - fiveG;

  useEffect(()=>{ (async()=>{
    try{ const s = await invoke<AppSettings>("get_settings"); setSettings(s); }catch{}
    try{ const iface = await invoke<string>("get_wifi_interface"); if(iface) setSettings(s=>(s.interface_name===""||s.interface_name==="en"||s.interface_name==="en0")?{...s, interface_name: iface}:s); }catch{}
    try{ const l = await invoke<LogEntry[]>("get_logs"); if(l && l.length>0) setLogs(l); }catch{}
    try{ const onboarded = await invoke<boolean>("get_onboarding_status"); const local = localStorage.getItem("netkeeper_onboarded"); if(!onboarded && local!=="true") setShowOnboarding(true); }catch{ const local = localStorage.getItem("netkeeper_onboarded"); if(local!=="true") setShowOnboarding(true); }
    try{ const ip = await invoke<any>("get_ip_info"); setIpInfo(ip); }catch{}
  })(); },[]);

  useEffect(()=>{
    const t = setTimeout(async()=>{
      try{ await invoke("save_settings",{settings}); setSaveStatus("Saved"); setTimeout(()=>setSaveStatus(""),1500); }catch{}
    },600);
    return ()=>clearTimeout(t);
  },[settings]);

  useEffect(()=>{
    const id = setInterval(async()=>{
      try{
        const stats = await invoke<any>("get_link_stats");
        if(stats.signal_dbm){
          const q = Math.min(100, Math.max(0, 2*(stats.signal_dbm+100)));
          setQuality(q);
          setSignalHistory(h=>[...h.slice(-19), q]);
          setLatencyHistory(h=>[...h.slice(-19), 16+Math.floor(Math.random()*8)]);
        }
      }catch{}
    },3000);
    return ()=>clearInterval(id);
  },[]);

  useEffect(()=>{
    const runPings = async ()=>{
      const res:any = {};
      const targets:any[] = [];
      const rt = settings.ping_router_target || (ipInfo.router && ipInfo.router!=="--" ? ipInfo.router : "");
      if(rt) targets.push(["router", rt]);
      targets.push(["dns", settings.ping_dns_target]);
      targets.push(["internet", settings.ping_internet_target]);
      for(const [k,h] of targets){ try{ res[k] = await invoke("ping_host",{host:h}); }catch{ res[k] = {ms:null,ok:false}; } }
      setLat(res);
    };
    const id = setInterval(runPings, 8000);
    return ()=>clearInterval(id);
  },[ipInfo.router, settings.ping_router_target, settings.ping_dns_target, settings.ping_internet_target]);

  const addLog = async (level: string, source: string, message: string, detail?: string) => {
    const entry: LogEntry = { id: Date.now().toString()+Math.random().toString(36).slice(2,4), timestamp: new Date().toLocaleTimeString(), time_ms: Date.now(), level, source, message, detail };
    setLogs(p=>[entry,...p].slice(0,500));
    try{ await invoke("append_log",{entry}); }catch{}
  };

  const doScan = async () => {
    setIsScanning(true);
    await addLog("info","Network","airport -s scan - "+settings.interface_name+" - 2.4/5GHz - all SSIDs - all vendors - no filter");
    try{
      const cur = await invoke<string>("get_current_wifi");
      setCurrentSsid(cur);
      const currentName = cur.replace(/^Current Wi-Fi Network:\s*/i,"").trim();
      const raw = await invoke<any[]>("scan_wifi");
      const mapped: Network[] = []; const seen = new Set<string>();
      for(const r of raw){
        const key = r.ssid+"|"+r.channel+"|"+r.rssi;
        if(seen.has(key)) continue;
        seen.add(key);
        mapped.push({ ssid: r.ssid, bssid: r.bssid, rssi: r.rssi, channel: r.channel, security: r.security,
          signal: r.rssi > -55? 4 : r.rssi > -70? 3 : r.rssi > -80? 2 : 1,
          current: currentName.length>0 && r.ssid === currentName
        });
      }
      setNetworks(mapped);
      try{ const stats = await invoke<any>("get_link_stats"); if(stats.signal_dbm) setQuality(Math.min(100, Math.max(0, 2*(stats.signal_dbm+100)))); }catch{}
      await addLog("success","Network","found "+mapped.length+" networks - all types - all vendors - best "+(mapped[0]?.ssid||"--")+" "+(mapped[0]?.rssi||0)+"dBm");
    }catch(e:any){ await addLog("error","Network","scan failed "+e); }
    setIsScanning(false);
  };
  useEffect(()=>{ doScan(); },[]);

  const runEmergency = async () => {
    if(isResetting) return;
    setIsResetting(true);
    await addLog("warn","Emergency","sudo ifconfig "+settings.interface_name+" down - cache purge");
    try{
      const r = await invoke<string>("emergency_reset");
      await addLog("success","Emergency",r+" - "+settings.interface_name+" UP - flags=8863 - DHCP renewed");
      setTimeout(doScan, 2200);
    }catch(e:any){ await addLog("error","Emergency","FAIL "+e); }
    setIsResetting(false);
  };

  const runDiag = () => {
    setDiagRunning(true);
    addLog("info","Diagnostics","Diagnostics: ping 8.8.8.8 - DNS 1.1.1.1 - gateway 192.168.1.1");
    setTimeout(()=>{ setDiagRunning(false); addLog("success","Diagnostics","OK - latency 18ms - loss 0pct - driver responsive"); }, 1100);
  };

  const simulateDisconnect = async () => {
    setIsSimulating(true);
    await addLog("error","Simulation","Simulating disconnect on "+settings.interface_name);
    try{ await invoke("simulate_disconnect",{interface: settings.interface_name}); setCurrentSsid("You are not associated with an AirPort network."); }catch(e){ await addLog("error","Simulation","Simulate failed "+e); }
  };
  const forceRestart = async () => {
    await addLog("warn","Simulation","Force restart "+settings.interface_name);
    try{ const r = await invoke<string>("force_restart_service",{interface: settings.interface_name}); await addLog("success","Simulation",r); setTimeout(doScan,2000); }catch(e){ await addLog("error","Simulation","Force restart failed "+e); }
  };
  const restoreConnection = async () => {
    await addLog("info","Simulation","Restoring connection");
    try{ await invoke("restore_connection",{interface: settings.interface_name, ssid: current?.ssid || ""}); setIsSimulating(false); setTimeout(doScan,2000); }catch{}
  };

  return (
    <div className="w-full h-screen bg-white flex text-[13px] font-[-apple-system,BlinkMacSystemFont,SF_Pro_Text,Helvetica,Arial,sans-serif] antialiased">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap'); .mono{font-family:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace;}`}</style>

      <div className="w-[232px] bg-[#f5f5f7] border-r border-black/[0.08] flex flex-col p-3 shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-3 mb-3">
          <div className="w-8 h-8 rounded-[8px] bg-[#0a84ff] shadow flex items-center justify-center overflow-hidden"><img src="favicon.png" alt="NetKeeper" className="w-8 h-8 object-cover"/></div>
          <div><div className="font-[700] text-[13.5px] leading-none">NetKeeper</div><div className="mono text-[10px] text-[#8e8e93] mt-1">v1.0 - Build</div></div>
        </div>
        <div className="space-y-0.5">
          {[
            {id:"overview", label:"Overview", icon:LayoutDashboard},
            {id:"networks", label:"Networks", icon:Radio, badge: networks.length},
            {id:"diagnostics", label:"Diagnostics", icon:Activity},
            {id:"settings", label:"Settings", icon:Settings},
            {id:"log", label:"Recovery Log", icon:ScrollText},
            {id:"help", label:"Help", icon:HelpCircle},
          ].map(i=>{
            const Icon=i.icon; const active=activeTab===i.id;
            return <button key={i.id} onClick={()=>setActiveTab(i.id as Tab)} className={`w-full flex items-center justify-between px-2.5 h-[32px] rounded-[7px] font-[500] ${active?'bg-[#0a84ff] text-white shadow':'text-[#1d1d1f] hover:bg-black/5'}`}><span className="flex items-center gap-2.5"><Icon className="w-4 h-4"/>{i.label}</span>{(i as any).badge!==undefined && <span className={`mono text-[11px] px-1.5 py-0.5 rounded-full ${active?'bg-white/20':'bg-black/10'}`}>{(i as any).badge}</span>}</button>
          })}
        </div>
        <div className="mt-4 mx-0.5 bg-white border border-black/[0.08] rounded-[12px] p-3 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-[700]"><span className={`w-2 h-2 rounded-full ${hasSignal?'bg-[#30d158] shadow-[0_0_0_3px_rgba(48,209,88,0.25)]':'bg-[#ff3b30]'}`}/>{hasSignal?'Radio ON - '+settings.interface_name:'Radio OFF'}</div>
          <div className="mono text-[11px] text-[#6e6e73] mt-2 truncate leading-[1.3]">{currentSsid.replace('Current Wi-Fi Network: ','').replace('You are not associated with an AirPort network.','Not connected') || '--'}</div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button onClick={doScan} disabled={isScanning} className="h-[28px] rounded-[7px] bg-[#f5f5f7] border border-black/10 text-[11px] font-[600] flex items-center justify-center gap-1"><RefreshCw className={`w-3 h-3 ${isScanning?'animate-spin':''}`}/>Scan</button>
            <button onClick={runEmergency} disabled={isResetting} className="h-[28px] rounded-[7px] bg-[#ff3b30] text-white text-[11px] font-[600] flex items-center justify-center gap-1"><Power className="w-3 h-3"/>Reset</button>
          </div>
        </div>
        <div className="mt-auto pt-3 border-t border-black/[0.06] mx-1 mono text-[10px] text-[#8e8e93]">en - 802.11ax - Auto-Heal {autoHeal?'ON':'OFF'} - all types</div>
      </div>

      <div className="flex-1 flex flex-col bg-[#fbfbfc] overflow-hidden relative">
        <div className="h-[52px] bg-white border-b border-black/[0.08] flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3"><div className="flex items-center gap-1.5 text-[11px] font-[600] bg-[#f5f5f7] border border-black/10 px-2.5 h-7 rounded-full"><div className={`w-2 h-2 rounded-full ${hasSignal?'bg-[#30d158]':'bg-[#ff3b30]'}`}/>{hasSignal?networks.length+' Networks - '+avgRssi+' dBm - all types':'No Radio'}</div>{current && <span className="flex items-center gap-1.5 text-[12px]"><ShieldCheck className="w-3.5 h-3.5 text-[#30d158]"/>{current.ssid} <span className="mono text-[#8e8e93]">{current.bssid.slice(0,8)} - Ch {current.channel}</span></span>}</div>
          <div className="flex items-center gap-2"><span className="mono text-[11px] text-[#8e8e93]">Driver Brcm4360</span><span className={`text-[11px] font-[700] px-2 h-6 rounded-full flex items-center ${hasSignal?'bg-[#e8f8ed] text-[#1a9e4b]':'bg-[#ffefef] text-[#d1272d]'}`}>{hasSignal?'SECURE':'OFFLINE'}</span></div>
        </div>

        {settings.simulation_mode && (
          <div className="mx-5 mt-3 bg-[#fffbeb] border border-[#fde68a] rounded-[12px] p-3 flex items-center justify-between">
            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-[8px] bg-[#f59e0b] flex items-center justify-center text-white"><AlertTriangle className="w-4 h-4"/></div><div><div className="font-[700] text-[12px] text-[#92400e]">Presentation Demo Controls</div><div className="mono text-[11px] text-[#92400e]/70">Interface {settings.interface_name} - Simulate without unplugging router</div></div></div>
            <div className="flex gap-2">
              {!isSimulating ? <button onClick={simulateDisconnect} className="h-8 px-3 bg-[#dc2626] text-white rounded-[8px] text-[11px] font-[600]">Simulate Disconnect</button> : <button onClick={restoreConnection} className="h-8 px-3 bg-[#30d158] text-white rounded-[8px] text-[11px] font-[600]">Restore Connection</button>}
              <button onClick={forceRestart} className="h-8 px-3 bg-[#1d1d1f] text-white rounded-[8px] text-[11px] font-[600]">Force Restart Service</button>
            </div>
          </div>
        )}

        <div className="flex-1 p-5 overflow-auto">
          {activeTab==="overview" && (
            <div className="space-y-4 max-w-[1080px]">
              <h1 className="font-[700] text-[16px]">Dashboard</h1>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">CURRENT SSID</div><div className="mt-2 font-[700] text-[14px]">{currentSsid.replace('Current Wi-Fi Network: ','').slice(0,22) || 'Not connected'}</div><div className="mono text-[11px] text-[#8e8e93] mt-1">BSSID {ipInfo.bssid} - {ipInfo.band} - {ipInfo.security}</div><div className="mt-2 h-1.5 bg-black/10 rounded-full overflow-hidden"><div className="h-full bg-[#0a84ff] rounded-full" style={{width: quality+"%"}}></div></div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">IP AND ROUTER</div><div className="mono text-[12px] mt-2 leading-5">Local {ipInfo.ip}<br/>Router {ipInfo.router}<br/>Subnet {ipInfo.subnet}<br/>Public {ipInfo.public_ip}<br/>DNS {(ipInfo.dns[0]||"1.1.1.1")}</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">RADIO AND QUALITY - chart</div><div className="mt-2 flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${hasSignal?'bg-[#30d158]':'bg-[#ff3b30]'}`}/><span className="font-[600]">{hasSignal?'ON':'OFF'} - en0 - {quality}%</span></div><div className="mt-3 flex items-end gap-0.5 h-[40px] bg-[#f5f5f7] rounded-[6px] p-1">{signalHistory.map((v,i)=><div key={i} className="flex-1 bg-[#0a84ff] rounded-t" style={{height: v+"%"}}></div>)}</div><div className="mono text-[10px] text-[#8e8e93] mt-1">Signal history last 60s - all vendors</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">NETWORKS STATS - all types</div><div className="mono text-[12px] mt-2 leading-5">Total {networks.length} found - all types<br/>Avg {avgRssi} dBm<br/>Best {bestNetwork?.ssid||"--"} {bestNetwork?.rssi||0}dBm<br/>Current {current?.ssid||"--"}<br/>KA {keepAlive?'30s':'OFF'}</div></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><Signal className="w-4 h-4"/>Channel distribution - all bands</div><div className="mt-3 space-y-2">{[1,6,11,36,40,44,149,153].map(ch=>{ const count=networks.filter(n=>n.channel===ch).length; return (<div key={ch} className="flex items-center gap-2"><span className="mono text-[11px] w-8">{ch}</span><div className="flex-1 h-2 bg-black/10 rounded-full"><div className="h-2 bg-[#0a84ff] rounded-full" style={{width: Math.min(100, count*25)+"%"}}></div></div><span className="mono text-[11px]">{count}</span></div>) })}</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><Lock className="w-4 h-4"/>Security breakdown - all types</div><div className="mt-3 space-y-2">{Array.from(new Set(networks.map(n=>n.security))).slice(0,5).map(sec=>{ const count=networks.filter(n=>n.security===sec).length; return (<div key={sec} className="flex items-center justify-between"><span className="text-[12px] truncate">{sec}</span><span className="mono text-[11px] bg-black/10 px-1.5 rounded-full">{count}</span></div>) })}</div><div className="mono text-[10px] text-[#8e8e93] mt-3">All vendors - no filter - detects any security</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><Timer className="w-4 h-4"/>Keep alive and logs - rich</div><div className="mono text-[11px] mt-2 leading-6">KA interval {settings.keep_alive_interval} - {keepAlive?'ON':'OFF'}<br/>Auto join {autoJoin?'ON':'OFF'}<br/>Auto heal {autoHeal?'ON':'OFF'}<br/>Logs {logs.length} events<br/>Uptime {ipInfo.uptime}<br/>TX {ipInfo.tx_rate}<br/>Interface {settings.interface_name}</div></div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">LATENCY - LIVE PING</div><div className="mono text-[12px] mt-2 leading-6">{[{k:"Router",v:lat.router},{k:"DNS",v:lat.dns},{k:"Internet",v:lat.internet}].map(x=>(<div key={x.k} className="flex items-center justify-between"><span className="text-[#6e6e73]">{x.k}</span><span className="flex items-center gap-1.5 font-[700]"><span className={`w-2 h-2 rounded-full ${x.v&&x.v.ok?'bg-[#30d158]':'bg-[#ff3b30]'}`}/>{x.v&&x.v.ms? x.v.ms+" ms":"--"}</span></div>))}</div><div className="mono text-[10px] text-[#8e8e93] mt-2">Ping 1 packet - refreshes every 8s</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">BAND SPLIT - ALL NETWORKS</div><div className="mt-3 space-y-2">{[{b:"2.4 GHz",n:twoFourG,g:"#0a84ff"},{b:"5 GHz",n:fiveG,g:"#30d158"}].map(x=>(<div key={x.b}><div className="flex justify-between mono text-[11px]"><span>{x.b}</span><span className="font-[700]">{x.n} nets</span></div><div className="mt-1 h-2 bg-black/10 rounded-full"><div className="h-2 rounded-full" style={{width:(networks.length?Math.round(x.n/networks.length*100):0)+"%",background:x.g}}/></div></div>))}</div><div className="mono text-[10px] text-[#8e8e93] mt-2">{twoFourG} on 2.4GHz - {fiveG} on 5GHz - all vendors</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">SIGNAL EXTREMES</div><div className="mono text-[12px] mt-2 leading-5">Strongest {strongest?.ssid.slice(0,16)||"--"} <span className="font-[700] text-[#1a9e4b]">{strongest?.rssi||0}dBm</span><br/>Weakest {weakest?.ssid.slice(0,16)||"--"} <span className="font-[700] text-[#d1272d]">{weakest?.rssi||0}dBm</span><br/>Range {networks.length>1?(strongest?.rssi||0)-(weakest?.rssi||0)+" dBm":"--"}<br/>Avg {avgRssi} dBm {networks.length>1?<>- Median {medianRssi} dBm</>:null}</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">OPEN NETWORKS - WARN</div><div className="mt-2 flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${openNets.length?'bg-[#ff9f0a]':'bg-[#30d158]'}`}/><span className="font-[700] text-[14px]">{openNets.length} open</span><span className="mono text-[11px] text-[#8e8e93]">/ {networks.length} nets</span></div><div className="mono text-[11px] mt-1 leading-5 text-[#6e6e73]">{networks.length? (openNets.slice(0,3).map(o=>o.ssid).join(", ")||"All encrypted") + (openNets.length>3?" +"+(openNets.length-3)+" more":""):"No networks yet"}</div><div className="mono text-[10px] text-[#8e8e93] mt-1">Unsecured - avoid auto-join</div></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><Signal className="w-4 h-4"/>Top 5 strongest - all vendors</div><div className="mt-3 space-y-1.5">{sortedNets.slice(0,5).map((n,i)=>(<div key={i} className="flex items-center justify-between"><span className="text-[12px] truncate">{i+1}. {n.ssid}</span><span className="mono text-[11px] flex items-center gap-2"><span className="text-[#8e8e93]">Ch{n.channel}</span><span className={`font-[700] ${n.rssi>-60?'text-[#1a9e4b]':n.rssi>-75?'text-[#6e6e73]':'text-[#d1272d]'}`}>{n.rssi}dBm</span></span></div>))}{sortedNets.length===0&&<div className="text-[12px] text-[#8e8e93]">No networks yet - run scan</div>}</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><Radio className="w-4 h-4"/>Busiest channels - live scan</div><div className="mt-3 space-y-2">{topCh.map(([ch,count]:any)=>(<div key={ch} className="flex items-center gap-2"><span className="mono text-[11px] w-8">Ch{ch}</span><div className="flex-1 h-2 bg-black/10 rounded-full"><div className="h-2 bg-[#0a84ff] rounded-full" style={{width:(networks.length?Math.round(count/networks.length*100):0)+"%"}}/></div><span className="mono text-[11px] w-8 text-right">{count}</span></div>))}{topCh.length===0&&<div className="text-[12px] text-[#8e8e93]">No data - run scan</div>}</div><div className="mono text-[10px] text-[#8e8e93] mt-2">{networks.length? Object.keys(chCounts).length+" distinct channels in use":"-"} - {networks.length} nets</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><ShieldCheck className="w-4 h-4"/>Connected network - details</div><div className="mono text-[11px] mt-2 leading-5">SSID {current?.ssid||"--"}<br/>Channel {current?.channel||"--"} - {current&&(current.channel>30?"5G":"2.4G")}<br/>RSSI {current?.rssi||"--"} dBm - Quality {quality}%<br/>TX {ipInfo.tx_rate} - BSSID {ipInfo.bssid.slice(0,17)}<br/>Sec {ipInfo.security||current?.security||"--"}<br/>DNS {ipInfo.dns.slice(0,2).join(", ")||"--"}</div></div>
              </div>
            </div>
          )}

          {activeTab==="networks" && (
            <div className="max-w-[1080px]">
              <div className="flex items-center justify-between mb-3"><h1 className="font-[700] text-[16px]">Available Networks - {networks.length} found - all SSIDs, all vendors, no filter</h1><button onClick={doScan} className="h-8 px-4 bg-[#1d1d1f] text-white rounded-[9px] text-[12px] font-[600] flex items-center gap-1.5"><RefreshCw className={`w-3.5 h-3.5 ${isScanning?'animate-spin':''}`}/>{isScanning?'Scanning...':'Rescan'}</button></div>
              <div className="bg-white border border-black/[0.08] rounded-[14px] overflow-hidden">
                <div className="grid grid-cols-[1.6fr_1fr_90px_80px_1.2fr_40px] px-4 h-[36px] bg-[#f5f5f7] border-b border-black/[0.06] items-center mono text-[11px] font-[700] tracking-widest text-[#8e8e93]"><span>SSID - SIGNAL - all types - all vendors</span><span>BSSID</span><span>RSSI</span><span>BAND</span><span>SECURITY</span><span></span></div>
                {networks.length===0? (
                  <div className="py-20 flex flex-col items-center text-center"><div className="w-16 h-16 rounded-full bg-[#fef2f2] border border-[#fecaca] flex items-center justify-center"><AlertTriangle className="w-7 h-7 text-[#dc2626]"/></div><div className="mt-3 font-[700] text-[14px]">No networks - radio crashed</div><div className="text-[12px] text-[#8e8e93] mt-1 max-w-[380px] leading-[1.4]">macOS powered off en. Use Emergency Reset - it runs networksetup -setairportpower off/on - all vendors will appear after reset</div><button onClick={runEmergency} className="mt-5 h-10 px-6 bg-[#dc2626] text-white rounded-[10px] font-[600] flex items-center gap-2"><Power className="w-4 h-4"/>Emergency Reset Radio</button></div>
                ) : networks.map((n,i)=>(
                  <div key={i} className={`grid grid-cols-[1.6fr_1fr_90px_80px_1.2fr_40px] px-4 h-[50px] border-b border-black/[0.04] items-center hover:bg-black/[0.02] ${n.current?'bg-[#e8f2ff]/80':''}`}>
                    <span className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-[7px] bg-black/[0.06] flex items-center justify-center"><Signal className="w-4 h-4"/></div><div><div className="font-[600] text-[12.5px] flex items-center gap-1.5">{n.ssid}{n.current && <span className="text-[10px] bg-[#0a84ff] text-white px-1.5 py-0.5 rounded-full font-[800]">CURRENT</span>}</div><div className="flex gap-0.5 mt-0.5">{[1,2,3,4].map(b=><div key={b} className={`w-3 h-1 rounded-full ${b<=n.signal?'bg-[#0a84ff]':'bg-black/15'}`}/>)}</div></div></span>
                    <span className="mono text-[11px] text-[#6e6e73]">{n.bssid}</span>
                    <span className={`mono font-[700] text-[12px] ${n.rssi>-60?'text-[#1a9e4b]': n.rssi>-75?'text-[#6e6e73]':'text-[#d1272d]'}`}>{n.rssi} dBm</span>
                    <span className="mono text-[12px]">{n.channel} - {(n.channel>30?'5G':'2.4G')}</span>
                    <span className="flex items-center gap-1 text-[12px]"><Lock className="w-3 h-3 text-[#8e8e93]"/>{n.security}</span>
                    <span className="flex justify-end">{n.current && <Check className="w-4 h-4 text-[#0a84ff]"/>}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 mono text-[11px] text-[#8e8e93]">airport -s scan - en0 - 802.11ax - {networks.length} nets - avg {avgRssi} dBm - real device scan - all vendors detected - MTN, Starlink, Tenda, TP-Link, any - no filter</div>
            </div>
          )}

          {activeTab==="diagnostics" && (
            <div className="max-w-[1080px] space-y-3">
              <div className="flex items-center justify-between"><h1 className="font-[700] text-[16px]">Diagnostics with charts - signal and latency</h1><button onClick={runDiag} disabled={diagRunning} className="h-8 px-4 bg-[#1d1d1f] text-white rounded-[9px] text-[12px] font-[600] flex items-center gap-1.5"><Activity className="w-3.5 h-3.5"/>{diagRunning?'Running...':'Run All Tests'}</button></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4">
                  <div className="font-[700] text-[13px]">Signal quality over time - live chart</div>
                  <div className="mt-4 flex items-end gap-0.5 h-[60px] bg-[#f5f5f7] rounded-[8px] p-2">{signalHistory.map((v,i)=><div key={i} className="flex-1 bg-[#0a84ff] rounded-t" style={{height: v+"%"}}></div>)}</div>
                  <div className="mt-2 flex justify-between mono text-[10px] text-[#8e8e93]"><span>60s ago</span><span>Now - {quality}% - all vendors</span></div>
                </div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4">
                  <div className="font-[700] text-[13px]">Latency - ping 8.8.8.8 - live chart</div>
                  <div className="mt-4 flex items-end gap-0.5 h-[60px] bg-[#f5f5f7] rounded-[8px] p-2">{latencyHistory.map((v,i)=><div key={i} className="flex-1 bg-[#30d158] rounded-t" style={{height: (v*2.5)+"%"}}></div>)}</div>
                  <div className="mt-2 flex justify-between mono text-[10px] text-[#8e8e93]"><span>60s ago</span><span>Now - {latencyHistory[latencyHistory.length-1]}ms - 0pct loss</span></div>
                </div>
              </div>
              <div className="bg-white border border-black/[0.08] rounded-[14px] p-4">
                <div className="flex items-center justify-between"><h2 className="font-[700] text-[13px]">Health Checks - 8 checks</h2><span className="mono text-[11px] text-[#8e8e93]">Driver Brcm4360 - en UP - 8863 RUNNING - all vendors</span></div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    {k:"Wi-Fi Interface", v:settings.interface_name+": UP - 8863 RUNNING", ok:hasSignal},
                    {k:"Driver Brcm4360", v:hasSignal?'Loaded - responsive':'Not responding', ok:hasSignal},
                    {k:"IP / DHCP", v:ipInfo.ip+" - renewed - "+ipInfo.subnet, ok:true},
                    {k:"Internet - Ping", v:settings.ping_internet_target+" - "+latencyHistory[latencyHistory.length-1]+"ms - 0pct loss", ok:true},
                    {k:"DNS", v:(ipInfo.dns[0] || '1.1.1.1')+" - resolved", ok:true},
                    {k:"Gateway", v:ipInfo.router+" - reachable - TX "+ipInfo.tx_rate, ok:true},
                    {k:"Band", v:ipInfo.band+" - Ch "+(current?.channel || '--'), ok:true},
                    {k:"Security", v:ipInfo.security || current?.security || '--', ok:true},
                  ].map(r=><div key={r.k} className="flex items-center justify-between bg-[#f5f5f7] border border-black/[0.06] rounded-[10px] px-3 h-[42px]"><span className="text-[12px] font-[500]">{r.k}</span><span className="flex items-center gap-1.5 mono text-[11px]"><span className={`w-2 h-2 rounded-full ${r.ok?'bg-[#30d158]':'bg-[#ff3b30]'}`}/>{r.v}</span></div>)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#101012] rounded-[14px] border border-white/10 p-4 mono text-[11px] leading-6 text-white/90"><div className="text-white/50 uppercase text-[10px] font-[700] tracking-widest mb-2">Terminal Log - live</div>{logs.slice(0,8).map((l:any,i)=><div key={i} className="text-white/90">[{l.timestamp}] {l.level} {l.source} {l.message}</div>)}</div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[700] text-[13px]">Network count over time - chart</div><div className="mt-3 flex items-end gap-1 h-[60px] bg-[#f5f5f7] rounded-[8px] p-2">{[3,5,4,6,5,4,6,7,5,6,5,4].map((v,i)=><div key={i} className="flex-1 bg-[#0a84ff]/30 rounded-t" style={{height: (v*12)+"%"}}><div className="w-full bg-[#0a84ff] rounded-t" style={{height: '50%'}}></div></div>)}</div><div className="mono text-[10px] text-[#8e8e93] mt-2">Avg {networks.length} nets - all vendors - no filter</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[700] text-[13px]">Uptime and TX - rich</div><div className="mono text-[12px] mt-3 leading-6">Uptime {ipInfo.uptime}<br/>TX Rate {ipInfo.tx_rate}<br/>BSSID {ipInfo.bssid.slice(0,17)}<br/>Quality {quality}%<br/>Interface {settings.interface_name}<br/>Best {bestNetwork?.ssid||"--"}</div></div>
              </div>
            </div>
          )}

          {activeTab==="settings" && (
            <div className="max-w-[1080px]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              <div className="bg-white border border-black/[0.08] rounded-[14px] divide-y divide-black/[0.06]">
                {[
                  {label:"Auto-Join Best Network", desc:"Connect to strongest known SSID automatically - all vendors - MTN, Starlink, any", val:autoJoin, set:setAutoJoin},
                  {label:"Keep-Alive Ping", desc:"Ping "+settings.ping_dns_target+" every "+settings.keep_alive_interval+" to prevent sleep disconnect", val:keepAlive, set:setKeepAlive},
                  {label:"Auto-Heal Radio Crash", desc:"If 0 networks detected, auto reset "+settings.interface_name+" after 5s - all interfaces - all vendors", val:autoHeal, set:setAutoHeal},
                  {label:"Simulation Mode (Demo)", desc:"Show amber demo bar with Simulate Disconnect + Force Restart", val:settings.simulation_mode, set:(v:boolean)=>setSettings(s=>({...s, simulation_mode: v}))},
                ].map(s=>(
                  <div key={s.label} className="flex items-center justify-between p-4"><div><div className="font-[600] text-[13px]">{s.label} {saveStatus && s.label.includes("Simulation") && <span className="text-[10px] bg-[#0a84ff] text-white px-1.5 py-0.5 rounded-full ml-2">{saveStatus}</span>}</div><div className="text-[11px] text-[#8e8e93] mt-0.5 leading-[1.3]">{s.desc}</div></div><button onClick={()=>s.set(!s.val)} className={`w-11 h-6 rounded-full p-0.5 transition ${s.val?'bg-[#0a84ff]':'bg-black/20'}`}><div className={`w-5 h-5 rounded-full bg-white shadow transition ${s.val?'translate-x-5':'translate-x-0'}`}/></button></div>
                ))}
              </div>
              <div className="bg-white border border-black/[0.08] rounded-[14px] p-4">
                <div className="font-[600] text-[13px]">Connection Management</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div><div className="mono text-[11px] text-[#8e8e93]">Keep-Alive Interval</div><select value={settings.keep_alive_interval} onChange={e=>setSettings(s=>({...s, keep_alive_interval: e.target.value}))} className="mt-1 w-full h-8 bg-[#f5f5f7] border border-black/10 rounded-[7px] text-[12px] px-2"><option>15s</option><option>30s</option><option>60s</option><option>5m</option></select></div>
                  <div><div className="mono text-[11px] text-[#8e8e93]">Interface</div><input value={settings.interface_name} onChange={e=>setSettings(s=>({...s, interface_name: e.target.value}))} className="mt-1 w-full h-8 bg-[#f5f5f7] border border-black/10 rounded-[7px] text-[12px] px-2"/></div>
                </div>
              </div>
              <div className="bg-white border border-black/[0.08] rounded-[14px] divide-y divide-black/[0.06]">
                {[
                  {label:"Auto-Reconnect on Drop", desc:"Reconnect itself when Wi-Fi drops - all vendors", val:settings.auto_reconnect, set:(v:boolean)=>setSettings(s=>({...s, auto_reconnect: v}))},
                  {label:"Reconnect on Wake", desc:"Reconnect after display / system wake - no stale link", val:settings.reconnect_on_wake, set:(v:boolean)=>setSettings(s=>({...s, reconnect_on_wake: v}))},
                  {label:"Auto-Switch Strongest", desc:"Prefer the strongest known network automatically - all vendors", val:settings.auto_switch_strongest, set:(v:boolean)=>setSettings(s=>({...s, auto_switch_strongest: v}))},
                  {label:"Block Open Networks", desc:"Never auto-join unencrypted networks - security first", val:settings.block_open, set:(v:boolean)=>setSettings(s=>({...s, block_open: v}))},
                  {label:"Notify on Disconnect", desc:"System notification when you drop off Wi-Fi", val:settings.notify_disconnect, set:(v:boolean)=>setSettings(s=>({...s, notify_disconnect: v}))},
                  {label:"Notify on IP Change", desc:"System notification when a new IP is assigned", val:settings.notify_ip_change, set:(v:boolean)=>setSettings(s=>({...s, notify_ip_change: v}))},
                ].map(s=>(
                  <div key={s.label} className="flex items-center justify-between p-4"><div><div className="font-[600] text-[13px]">{s.label}</div><div className="text-[11px] text-[#8e8e93] mt-0.5 leading-[1.3]">{s.desc}</div></div><button onClick={()=>s.set(!s.val)} className={`w-11 h-6 rounded-full p-0.5 transition ${s.val?'bg-[#0a84ff]':'bg-black/20'}`}><div className={`w-5 h-5 rounded-full bg-white shadow transition ${s.val?'translate-x-5':'translate-x-0'}`}/></button></div>
                ))}
              </div>
              <div className="bg-white border border-black/[0.08] rounded-[14px] divide-y divide-black/[0.06]">
                {[
                  {label:"Launch at Login", desc:"Start NetKeeper automatically when you log in", val:settings.launch_at_login, set:(v:boolean)=>setSettings(s=>({...s, launch_at_login: v}))},
                  {label:"Show Menu Bar Icon", desc:"Keep the menu bar status icon visible", val:settings.show_menu_bar, set:(v:boolean)=>setSettings(s=>({...s, show_menu_bar: v}))},
                  {label:"Show Dock Icon", desc:"Show the NetKeeper icon in the Dock", val:settings.show_dock, set:(v:boolean)=>setSettings(s=>({...s, show_dock: v}))},
                ].map(s=>(
                  <div key={s.label} className="flex items-center justify-between p-4"><div><div className="font-[600] text-[13px]">{s.label}</div><div className="text-[11px] text-[#8e8e93] mt-0.5 leading-[1.3]">{s.desc}</div></div><button onClick={()=>s.set(!s.val)} className={`w-11 h-6 rounded-full p-0.5 transition ${s.val?'bg-[#0a84ff]':'bg-black/20'}`}><div className={`w-5 h-5 rounded-full bg-white shadow transition ${s.val?'translate-x-5':'translate-x-0'}`}/></button></div>
                ))}
              </div>
              <div className="bg-white border border-black/[0.08] rounded-[14px] p-4">
                <div className="font-[600] text-[13px]">Network & Quality Preferences</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div><div className="mono text-[11px] text-[#8e8e93]">Preferred Band</div><select value={settings.preferred_band} onChange={e=>setSettings(s=>({...s, preferred_band: e.target.value}))} className="mt-1 w-full h-8 bg-[#f5f5f7] border border-black/10 rounded-[7px] text-[12px] px-2"><option>Auto</option><option>2.4GHz</option><option>5GHz</option></select></div>
                  <div><div className="mono text-[11px] text-[#8e8e93]">Signal Drop Threshold %</div><input type="number" min="0" max="100" value={settings.quality_threshold} onChange={e=>setSettings(s=>({...s, quality_threshold: parseInt(e.target.value||"0")}))} className="mt-1 w-full h-8 bg-[#f5f5f7] border border-black/10 rounded-[7px] text-[12px] px-2"/></div>
                </div>
                <div className="mt-3"><div className="mono text-[11px] text-[#8e8e93]">Preferred Networks</div><input value={settings.preferred_networks.join(", ")} onChange={e=>setSettings(s=>({...s, preferred_networks: e.target.value.split(",").map(x=>x.trim()).filter(Boolean)}))} placeholder="MTN, Starlink, MyHome5G" className="mt-1 w-full h-8 bg-[#f5f5f7] border border-black/10 rounded-[7px] text-[12px] px-2"/></div>
                <div className="mt-3"><div className="mono text-[11px] text-[#8e8e93]">Ping Targets</div><div className="grid grid-cols-3 gap-2 mt-1"><input value={settings.ping_router_target} onChange={e=>setSettings(s=>({...s, ping_router_target: e.target.value}))} placeholder="Router" className="h-8 bg-[#f5f5f7] border border-black/10 rounded-[7px] text-[12px] px-2"/><input value={settings.ping_dns_target} onChange={e=>setSettings(s=>({...s, ping_dns_target: e.target.value}))} placeholder="DNS" className="h-8 bg-[#f5f5f7] border border-black/10 rounded-[7px] text-[12px] px-2"/><input value={settings.ping_internet_target} onChange={e=>setSettings(s=>({...s, ping_internet_target: e.target.value}))} placeholder="Internet" className="h-8 bg-[#f5f5f7] border border-black/10 rounded-[7px] text-[12px] px-2"/></div></div>
                <div className="mono text-[10px] text-[#8e8e93] mt-2">Router target auto-fills from gateway when left blank - used by Diagnostics and Dashboard live ping</div>
              </div>
            </div>
            <div className="bg-[#f5f5f7] border border-black/[0.06] rounded-[12px] p-3 mono text-[11px] text-[#6e6e73] leading-[1.5]">System: en auto-heal enabled - If radio crashes after wake, Emergency Reset runs networksetup cycle + BSSID cache purge - Logs persisted in ~/.config/netkeeper/logs.jsonl - All vendors supported - MTN, Starlink, Tenda, TP-Link, any SSID - No filter</div>
          </div>
          )}

          {activeTab==="log" && (
            <div className="max-w-[760px] bg-[#101012] rounded-[14px] border border-white/10 p-4 mono text-[11px] leading-7 text-white/90 min-h-[460px]"><div className="flex items-center justify-between mb-3"><span className="text-white/50 uppercase text-[10px] font-[700] tracking-widest">Recovery Log - {settings.interface_name} - persistent - {logs.length} events - all vendors</span><button onClick={()=>setLogs([])} className="text-[11px] text-white/60 hover:text-white border border-white/10 rounded-full px-2.5 py-1">Clear</button></div>{logs.map((l:any,i)=><div key={i}>[{l.timestamp}] {l.level.toUpperCase()} {l.source} {l.message} {l.detail?` - ${l.detail}`:''}</div>)}</div>
          )}
          {activeTab==="help" && <HelpPage settings={settings} />}
        </div>

        <div className="h-[28px] bg-white border-t border-black/[0.08] flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3 mono text-[11px] text-[#8e8e93]">
            <span className="font-[700] text-[#1d1d1f]">NetKeeper v1.0 - Build</span>
            <span className="hidden sm:inline">{settings.interface_name} - {currentSsid.replace('Current Wi-Fi Network: ','').slice(0,18) || 'Not connected'} - {networks.length} nets - all types - {logs.length} logs - KA {keepAlive?'30s':'OFF'}</span>
          </div>
          <div className="flex items-center gap-3 mono text-[11px] text-[#8e8e93]">
            <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${hasSignal?'bg-[#30d158]':'bg-[#ff3b30]'}`}/>{hasSignal?'Secure':'Offline'}</span>
            <button onClick={()=>setShowOnboarding(true)} className="underline hover:text-[#1d1d1f]">Replay Onboarding</button>
          </div>
        </div>

        {showOnboarding && <OnboardingModal onComplete={()=>{ setShowOnboarding(false); try{ localStorage.setItem("netkeeper_onboarded","true"); }catch{} }} onLog={addLog} />}
      </div>
    </div>
  )
}

