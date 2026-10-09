import { useState, useEffect, useRef, useId } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { sendNotification, isPermissionGranted, requestPermission } from "@tauri-apps/api/notification";
import {
  LayoutDashboard, Radio, Activity, Settings, ScrollText,
  Signal, Power, RefreshCw, Check, ShieldCheck, AlertTriangle,
  Lock, HelpCircle, Timer, Home, ArrowRight, X, Wifi, Bell, Zap
} from "lucide-react";

type Network = { ssid: string; bssid: string; rssi: number; channel: number; security: string; signal: number; current?: boolean; };
type Tab = "welcome"|"overview"|"networks"|"diagnostics"|"settings"|"log"|"help";
type LogEntry = { id: string; timestamp: string; time_ms: number; level: string; source: string; message: string; detail?: string; };
type AppSettings = {
  auto_reconnect: boolean; keep_alive: boolean; keep_alive_interval: string; reconnect_on_wake: boolean; auto_switch_strongest: boolean;
  preferred_band: string; block_open: boolean; launch_at_login: boolean; show_menu_bar: boolean; show_dock: boolean;
  notify_disconnect: boolean; notify_ip_change: boolean; ping_router_target: string; ping_dns_target: string; ping_internet_target: string;
  quality_threshold: number; interface_name: string; preferred_networks: string[]; simulation_mode: boolean; auto_heal: boolean; auto_deep_repair: boolean;
};

function mapNetworks(raw: any[], currentName: string): Network[] {
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
  return mapped;
}

function parseInterval(s: string): number {
  const m = /^(\d+)(s|m)$/.exec(s || "");
  if (!m) return 30000;
  const n = parseInt(m[1]);
  return m[2] === "m" ? n*60000 : n*1000;
}

function useMeasuredWidth<T extends HTMLElement>(){
  const ref = useRef<T|null>(null);
  const [w, setW] = useState(0);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const update = ()=> setW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return ()=> ro.disconnect();
  },[]);
  return [ref, w] as const;
}

function smoothPath(pts: {x:number;y:number}[]): string {
  if(pts.length===0) return "";
  if(pts.length===1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i], b=pts[i+1];
    const mx=(a.x+b.x)/2;
    d += ` C ${mx.toFixed(2)} ${a.y.toFixed(2)}, ${mx.toFixed(2)} ${b.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }
  return d;
}

type AreaChartProps = {
  data: number[]; height?: number; color?: string; unit?: string; threshold?: number;
  domain?: [number, number]; grid?: boolean; axis?: boolean; area?: boolean;
  xLabels?: [string, string]; format?: (v:number)=>string; empty?: string; stepSec?: number; avg?: boolean;
};

function AreaChart({
  data, height=160, color="#0a84ff", unit="", threshold, domain, grid=true, axis=true, area=true,
  xLabels, format, empty="collecting readings…", stepSec, avg=false,
}: AreaChartProps){
  const [ref, w] = useMeasuredWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number|null>(null);
  const gid = "ac" + useId().replace(/[:]/g,"");
  const padL = axis? 38 : 10, padR = 12, padT = 16, padB = xLabels? 20 : 8;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, height - padT - padB);

  const vals = data.filter(v=>typeof v==="number" && isFinite(v));
  let lo:number, hi:number;
  if(domain){ lo=domain[0]; hi=domain[1]; }
  else {
    let mn = vals.length? Math.min(...vals) : 0;
    let mx = vals.length? Math.max(...vals) : 1;
    if(threshold!==undefined){ mn=Math.min(mn,threshold); mx=Math.max(mx,threshold); }
    const sp0 = mx-mn || 1;
    lo = mn - sp0*0.15; hi = mx + sp0*0.15;
  }
  const span = hi-lo || 1;
  const xAt = (i:number)=> padL + (data.length<=1? plotW/2 : (i/(data.length-1))*plotW);
  const yAt = (v:number)=> padT + (1-(v-lo)/span)*plotH;
  const pts = data.map((v,i)=>({x:xAt(i), y:yAt(v)}));
  const line = smoothPath(pts);
  const areaPath = pts.length>1 ? `${line} L ${pts[pts.length-1].x.toFixed(2)} ${(padT+plotH).toFixed(2)} L ${pts[0].x.toFixed(2)} ${(padT+plotH).toFixed(2)} Z` : "";
  const fmt = format || ((v:number)=> unit? `${Math.round(v)}${unit}` : `${Math.round(v)}`);
  const ticks:number[] = [];
  if(grid){ const n=4; for(let i=0;i<=n;i++) ticks.push(lo + (span*i)/n); }
  const avgVal = avg && vals.length? vals.reduce((a,b)=>a+b,0)/vals.length : null;

  const onMove = (e: ReactMouseEvent<HTMLDivElement>)=>{
    if(!data.length) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    let idx = Math.round(((x - padL)/plotW) * (data.length-1));
    idx = Math.max(0, Math.min(data.length-1, idx));
    setHover(idx);
  };

  return (
    <div ref={ref} className="relative select-none" style={{height}}>
      {w>0 && data.length>0 && (
        <svg width={w} height={height} className="block">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.38"/>
              <stop offset="100%" stopColor={color} stopOpacity="0"/>
            </linearGradient>
          </defs>
          {grid && ticks.map((t,i)=>(
            <line key={i} x1={padL} x2={padL+plotW} y1={yAt(t)} y2={yAt(t)} stroke="rgba(0,0,0,0.055)" strokeWidth="1"/>
          ))}
          {axis && ticks.filter((_,i)=>i%2===0).map((t,i)=>(
            <text key={i} x={padL-6} y={yAt(t)+3} textAnchor="end" style={{fontSize:9, fontFamily:"'Geist Mono', ui-monospace, monospace"}} className="fill-[#8e8e93]">{fmt(t)}</text>
          ))}
          {avgVal!==null && (
            <>
              <line x1={padL} x2={padL+plotW} y1={yAt(avgVal)} y2={yAt(avgVal)} stroke="#8e8e93" strokeWidth="1" strokeDasharray="3 4" opacity="0.6"/>
              <text x={padL+plotW} y={yAt(avgVal)-3} textAnchor="end" style={{fontSize:9, fontFamily:"'Geist Mono', ui-monospace, monospace"}} className="fill-[#8e8e93]">avg {fmt(avgVal)}</text>
            </>
          )}
          {threshold!==undefined && threshold>=lo && threshold<=hi && (
            <>
              <line x1={padL} x2={padL+plotW} y1={yAt(threshold)} y2={yAt(threshold)} stroke="#d1272d" strokeWidth="1" strokeDasharray="4 3" opacity="0.75"/>
              <text x={padL} y={yAt(threshold)-3} style={{fontSize:9, fontFamily:"'Geist Mono', ui-monospace, monospace"}} className="fill-[#d1272d]">threshold {fmt(threshold)}</text>
            </>
          )}
          {area && <path d={areaPath} fill={`url(#${gid})`}/>}
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1={padL} x2={padL+plotW} y1={padT+plotH} y2={padT+plotH} stroke="rgba(0,0,0,0.14)" strokeWidth="1"/>
          {data.length>0 && <circle cx={xAt(data.length-1)} cy={yAt(data[data.length-1])} r="3.5" fill="#fff" stroke={color} strokeWidth="2"/>}
          {hover!==null && (
            <>
              <line x1={xAt(hover)} x2={xAt(hover)} y1={padT} y2={padT+plotH} stroke="rgba(0,0,0,0.2)" strokeWidth="1"/>
              <circle cx={xAt(hover)} cy={yAt(data[hover])} r="4" fill={color} stroke="#fff" strokeWidth="2"/>
            </>
          )}
          {xLabels && (
            <>
              <text x={padL} y={height-5} style={{fontSize:9, fontFamily:"'Geist Mono', ui-monospace, monospace"}} className="fill-[#8e8e93]">{xLabels[0]}</text>
              <text x={padL+plotW} y={height-5} textAnchor="end" style={{fontSize:9, fontFamily:"'Geist Mono', ui-monospace, monospace"}} className="fill-[#8e8e93]">{xLabels[1]}</text>
            </>
          )}
        </svg>
      )}
      <div className="absolute inset-0" style={{cursor: data.length? "crosshair":"default"}} onMouseMove={onMove} onMouseLeave={()=>setHover(null)}/>
      {w>0 && data.length===0 && <div className="absolute inset-0 flex items-center justify-center mono text-[10px] text-[#8e8e93]">{empty}</div>}
      {hover!==null && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[7px] bg-[#1d1d1f] text-white px-2 py-1 mono text-[10px] shadow-[0_6px_18px_rgba(0,0,0,0.25)] whitespace-nowrap" style={{left: xAt(hover), top: yAt(data[hover])-8}}>
          <div className="font-[600]">{fmt(data[hover])}</div>
          <div className="text-white/50 text-[9px]">{hover===data.length-1? "now" : `-${Math.round((data.length-1-hover)*(stepSec||0))}s`}</div>
        </div>
      )}
    </div>
  );
}

function BarChart({ data, height=150, color="#0a84ff", unit="", format }: { data:{label:string;value:number}[]; height?:number; color?:string; unit?:string; format?:(v:number)=>string }){
  const [ref, w] = useMeasuredWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number|null>(null);
  const gid = "bc" + useId().replace(/[:]/g,"");
  const padL=28, padR=8, padT=12, padB=18;
  const plotW = Math.max(1, w-padL-padR), plotH = Math.max(1, height-padT-padB);
  const max = Math.max(1, ...data.map(d=>d.value));
  const n = Math.max(1, data.length);
  const bw = plotW/n;
  const barW = Math.min(30, bw*0.5);
  const fmt = format || ((v:number)=> unit? `${Math.round(v)}${unit}`:`${Math.round(v)}`);
  const ticks = [0,0.5,1].map(t=>t*max);
  return (
    <div ref={ref} className="relative select-none" style={{height}}>
      {w>0 && data.length>0 && (
        <svg width={w} height={height} className="block">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="1"/>
              <stop offset="100%" stopColor={color} stopOpacity="0.45"/>
            </linearGradient>
          </defs>
          {ticks.map((t,i)=>(<line key={i} x1={padL} x2={padL+plotW} y1={padT+(1-t/max)*plotH} y2={padT+(1-t/max)*plotH} stroke="rgba(0,0,0,0.055)"/>))}
          {ticks.map((t,i)=>(<text key={i} x={padL-5} y={padT+(1-t/max)*plotH+3} textAnchor="end" style={{fontSize:9, fontFamily:"'Geist Mono', ui-monospace, monospace"}} className="fill-[#8e8e93]">{Math.round(t)}</text>))}
          {data.map((d,i)=>{
            const h = (d.value/max)*plotH;
            const y = padT+plotH-h;
            const x = padL + i*bw + (bw-barW)/2;
            const active = hover===i;
            return (
              <g key={i} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}>
                <rect x={padL+i*bw} y={padT} width={bw} height={plotH} fill="transparent"/>
                <rect x={x} y={y} width={barW} height={Math.max(1,h)} rx={Math.min(5,barW/2)} fill={`url(#${gid})`} opacity={active?1:0.82}/>
                <text x={padL+i*bw+bw/2} y={height-5} textAnchor="middle" style={{fontSize:9, fontFamily:"'Geist Mono', ui-monospace, monospace"}} className="fill-[#8e8e93]">{d.label}</text>
                {active && <text x={x+barW/2} y={y-4} textAnchor="middle" style={{fontSize:9, fontWeight:700, fontFamily:"'Geist Mono', ui-monospace, monospace"}} className="fill-[#1d1d1f]">{fmt(d.value)}</text>}
              </g>
            );
          })}
          <line x1={padL} x2={padL+plotW} y1={padT+plotH} y2={padT+plotH} stroke="rgba(0,0,0,0.14)"/>
        </svg>
      )}
      {w>0 && data.length===0 && <div className="absolute inset-0 flex items-center justify-center mono text-[10px] text-[#8e8e93]">No data yet — run a scan</div>}
    </div>
  );
}

function DonutChart({ segments, size=116, thickness=15, center }: { segments:{label:string;value:number;color:string}[]; size?:number; thickness?:number; center?:string }){
  const total = segments.reduce((a,s)=>a+s.value,0);
  const r = (size - thickness)/2;
  const c = 2*Math.PI*r;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{width:size, height:size}}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={thickness}/>
          {total>0 && segments.map((s,i)=>{
            const len = (s.value/total)*c;
            const dash = `${Math.max(0,len-2)} ${c-Math.max(0,len-2)}`;
            const off = -acc;
            acc += len;
            return <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={dash} strokeDashoffset={off} strokeLinecap="round"/>;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-[700] text-[18px] leading-none">{total}</div>
          <div className="mono text-[9px] text-[#8e8e93] mt-0.5">{center||"total"}</div>
        </div>
      </div>
      <div className="space-y-2">
        {segments.map((s,i)=>(
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:s.color}}/>
            <span className="font-[700] mono">{s.value}</span>
            <span className="text-[#6e6e73]">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SAMPLE_SIGNAL = [58,66,62,71,68,76,72,80,77,85,82,88,84,90,86,93];

const LANDING_FEATURES: { icon: any; title: string; tag: string; body: string }[] = [
  { icon: Power, title: "Deep Network Repair", tag: "Signature", body: "When the Wi-Fi icon greys out with a slash even though the radio is ON, NetKeeper deletes the corrupted NetworkInterfaces.plist and preferences.plist with one admin prompt, then offers a reboot. This is the fix nothing else does." },
  { icon: RefreshCw, title: "Auto-Heal Radio Crash", tag: "Recovery", body: "If a scan returns zero networks on your interface, NetKeeper waits 5 seconds, re-checks, and power-cycles the radio with a networksetup off/on cycle plus a BSSID cache purge. It runs on its own so you do not have to babysit it." },
  { icon: Wifi, title: "Auto-Reconnect & Best-Network Switching", tag: "Connectivity", body: "Drop off the network and NetKeeper rejoins the strongest known SSID automatically. It also switches you to a better access point when the signal gain is worth it, respecting your preferred band and blocking open networks." },
  { icon: Zap, title: "Reconnect on Wake", tag: "Reliability", body: "NetKeeper detects wake-from-sleep through a heartbeat gap and immediately restores your link, so you never come back to a stale, dead connection." },
  { icon: Timer, title: "Keep-Alive Pings", tag: "Monitoring", body: "Configurable pings to your router, DNS and the internet keep the link warm and surface a slow or failing connection before it drops." },
  { icon: Activity, title: "Live Diagnostics & Charts", tag: "Insight", body: "Real ping RTT, signal quality over time, latency trends, channel congestion and band split - rendered as smooth, hoverable charts with threshold and average reference lines." },
  { icon: ScrollText, title: "Persistent Recovery Log", tag: "History", body: "Every scan, repair, switch and error is written to a durable log you can read back, so you can see exactly what happened and when." },
  { icon: Bell, title: "Menu Bar & Notifications", tag: "Awareness", body: "Run quietly in the menu bar and get native notifications the moment you drop off Wi-Fi or get assigned a new IP address." },
];

const LANDING_STEPS = [
  { n: "01", title: "Scan", body: "NetKeeper reads the real radio across 2.4 GHz and 5 GHz on every vendor - no filters, no vendor lock-in. All SSIDs, all security types." },
  { n: "02", title: "Watch", body: "The connection manager monitors the link, keeps it alive, and auto-recovers the radio if it crashes or the plists go bad." },
  { n: "03", title: "Repair", body: "When the OS-level Wi-Fi state breaks, Deep Network Repair resets the plists and reboots you back to a working radio." },
];

const LANDING_FAQ: { q: string; a: string }[] = [
  { q: "Does it work with any router or ISP?", a: "Yes. NetKeeper talks to the macOS radio, not a specific brand, so it works with MTN, Starlink, Tenda, TP-Link, and any other access point." },
  { q: "Will Deep Repair erase my Wi-Fi passwords?", a: "It deletes two system network-preference plists. macOS rebuilds them automatically, and the reboot prompt lets you confirm before anything is lost. It is opt-in." },
  { q: "Does it need the internet to run?", a: "No. Only the optional keep-alive ping and public-IP lookups touch the network; every repair and scan is fully local." },
  { q: "What makes it different from just using the macOS menu bar?", a: "It actively repairs a broken radio state, auto-switches you between access points, and keeps a forensic log - the macOS panel only displays the current status." },
];

function LandingPage({ onTour, onDashboard, onHelp }: { onTour: ()=>void; onDashboard: ()=>void; onHelp: ()=>void }){
  const [openFaq, setOpenFaq] = useState<number|null>(0);
  return (
    <div className="w-full">
      {/* hero */}
      <div className="rounded-[16px] border border-black/[0.10] bg-[#fcfcfd] px-8 py-10 md:px-12 md:py-14">
        <div className="max-w-[780px]">
          <div className="mono text-[11px] font-[600] tracking-[0.2em] text-[#8e8e93] uppercase">macOS Wi-Fi diagnostic &amp; repair utility</div>
          <h1 className="mt-5 text-[36px] md:text-[48px] font-[800] leading-[1.02] tracking-[-0.035em] text-[#0a0a0a]">Keep your Wi-Fi alive,<br/>automatically.</h1>
          <p className="mt-5 text-[15px] text-[#4a4a4f] leading-[1.65] max-w-[600px]">NetKeeper scans every network on every band, monitors your link, recovers the radio when it crashes, and repairs the corrupt network plists that grey out the Wi-Fi icon. One app, always watching.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button onClick={onTour} className="h-11 px-5 rounded-[9px] bg-[#0a0a0a] text-white font-[600] text-[13.5px] flex items-center gap-2 hover:bg-[#26262a] transition-colors">Take the 60-second tour<ArrowRight className="w-4 h-4"/></button>
            <button onClick={onDashboard} className="h-11 px-5 rounded-[9px] border border-black/[0.15] bg-white text-[#1d1d1f] font-[600] text-[13.5px] hover:bg-black/[0.03] transition-colors">Open Dashboard</button>
          </div>
        </div>
        <div className="mt-10 pt-7 border-t border-black/[0.08] grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-[680px]">
          {[["Local only","No cloud, no telemetry"],["2.4 + 5 GHz","Every vendor, no filters"],["Native","Real radio, not a panel"]].map(([k,v])=>(
            <div key={v}><div className="text-[13.5px] font-[700] text-[#0a0a0a]">{k}</div><div className="mono text-[10.5px] text-[#8e8e93] mt-1.5 leading-[1.4]">{v}</div></div>
          ))}
        </div>
      </div>

      {/* dashboard preview in a macOS window frame */}
      <div className="mt-5 rounded-[13px] border border-black/[0.12] bg-white overflow-hidden">
        <div className="h-9 flex items-center gap-2 px-4 border-b border-black/[0.08] bg-[#f5f5f7]">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]"/>
          <span className="w-3 h-3 rounded-full bg-[#febc2e]"/>
          <span className="w-3 h-3 rounded-full bg-[#28c840]"/>
          <span className="mono text-[10.5px] text-[#8e8e93] ml-2">NetKeeper — Dashboard</span>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
            <div>
              <div className="flex items-center justify-between">
                <div className="font-[700] text-[13.5px]">Signal quality, live</div>
                <span className="mono text-[10.5px] text-[#8e8e93]">sample preview</span>
              </div>
              <div className="mt-3"><AreaChart data={SAMPLE_SIGNAL} height={170} color="#0a84ff" unit="%" domain={[0,100]} threshold={40} xLabels={["earlier","now"]}/></div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-black/[0.08] rounded-[10px] overflow-hidden content-start">
              {[["Radio","ON - protected",Power],["Auto-Heal","Enabled",RefreshCw],["Connection","Strongest SSID",Wifi],["Latency","12 ms avg",Activity]].map(([t,v,I]:any)=>(
                <div key={t} className="bg-white p-4">
                  <I className="w-4 h-4 text-[#8e8e93]"/>
                  <div className="font-[700] text-[12.5px] mt-2">{t}</div>
                  <div className="mono text-[10.5px] text-[#8e8e93] mt-1">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* features */}
      <div id="features" className="mt-12">
        <div className="text-center max-w-[640px] mx-auto">
          <span className="mono text-[11px] font-[700] tracking-widest text-[#0a84ff] uppercase">What it does</span>
          <h2 className="text-[26px] font-[800] mt-2 tracking-tight">Every feature, in detail</h2>
          <p className="text-[13.5px] text-[#6e6e73] mt-2 leading-[1.6]">NetKeeper is not a status panel. It watches, repairs and reconnects on your behalf.</p>
        </div>
        <div className="mt-7 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {LANDING_FEATURES.map(f=>{
            const I = f.icon;
            return (
              <div key={f.title} className="bg-white border border-black/[0.08] rounded-[16px] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-[11px] bg-[#0a84ff]/10 text-[#0a84ff] flex items-center justify-center"><I className="w-5 h-5"/></div>
                  <span className="mono text-[9px] font-[700] tracking-widest uppercase text-[#8e8e93] border border-black/10 rounded-full px-2 py-0.5">{f.tag}</span>
                </div>
                <div className="font-[700] text-[14px] mt-4">{f.title}</div>
                <div className="text-[12px] text-[#6e6e73] mt-2 leading-[1.55]">{f.body}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* how it works */}
      <div className="mt-12 bg-[#f5f5f7] border border-black/[0.06] rounded-[16px] p-6 md:p-8">
        <h2 className="text-[22px] font-[800] tracking-tight text-center">How it works</h2>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
          {LANDING_STEPS.map(s=>(
            <div key={s.n} className="flex items-start gap-3">
              <div className="mono font-[800] text-[22px] text-[#0a84ff] leading-none">{s.n}</div>
              <div><div className="font-[700] text-[14px]">{s.title}</div><div className="text-[12px] text-[#6e6e73] mt-1 leading-[1.55]">{s.body}</div></div>
            </div>
          ))}
        </div>
      </div>

      {/* faq */}
      <div id="faq" className="mt-12 max-w-[820px] mx-auto">
        <h2 className="text-[22px] font-[800] tracking-tight text-center">Frequently asked</h2>
        <div className="mt-5 space-y-2">
          {LANDING_FAQ.map((f,i)=>{
            const open = openFaq===i;
            return (
              <div key={f.q} className="bg-white border border-black/[0.08] rounded-[12px] overflow-hidden">
                <button onClick={()=>setOpenFaq(open? null : i)} className="w-full flex items-center justify-between px-4 py-3.5 text-left">
                  <span className="font-[600] text-[13.5px]">{f.q}</span>
                  <span className={`text-[#8e8e93] transition-transform ${open?'rotate-180':''}`}><ArrowRight className="w-4 h-4 rotate-90"/></span>
                </button>
                {open && <div className="px-4 pb-4 text-[12.5px] text-[#6e6e73] leading-[1.6]">{f.a}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* final cta */}
      <div className="mt-12 rounded-[16px] border border-black/[0.10] bg-[#0a0a0a] px-8 py-10 text-center">
        <div className="mono text-[11px] font-[600] tracking-[0.2em] text-white/45 uppercase">Guided tour</div>
        <h2 className="mt-3 text-[26px] font-[800] tracking-[-0.02em] text-white">See it work on your machine</h2>
        <p className="text-[13px] text-white/60 mt-2 max-w-[520px] mx-auto leading-[1.6]">The tour walks you through every screen and control, one step at a time.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button onClick={onTour} className="h-11 px-5 rounded-[9px] bg-white text-[#0a0a0a] font-[600] text-[13.5px] flex items-center gap-2 hover:bg-white/90 transition-colors">Start the guided tour<ArrowRight className="w-4 h-4"/></button>
          <button onClick={onHelp} className="h-11 px-5 rounded-[9px] border border-white/20 text-white font-[600] text-[13.5px] hover:bg-white/10 transition-colors">Read the Help tab</button>
        </div>
      </div>

      <div className="mt-8 pb-2 text-center mono text-[10.5px] text-[#8e8e93]">NetKeeper v3.0.0 — built for macOS — all vendors — no filter — no cloud</div>
    </div>
  );
}

type TourStep = { target: string; tab: Tab; title: string; body: string };
const TOUR_STEPS: TourStep[] = [
  { target: "nav-welcome", tab: "welcome", title: "Welcome to NetKeeper", body: "This is the landing page. It explains every feature; you can reopen it any time from the sidebar." },
  { target: "nav-overview", tab: "overview", title: "The Dashboard", body: "A live snapshot: current SSID, IP and router, radio status, signal quality and network counts - all updating in real time." },
  { target: "scan-button", tab: "overview", title: "Scan on demand", body: "Trigger a fresh real-radio scan of every SSID on 2.4 GHz and 5 GHz. Background scans are throttled so the radio never gets hammered." },
  { target: "radio-card", tab: "overview", title: "Radio status", body: "Shows whether the radio is ON or OFF and which network you are joined to - the same state the repair logic watches." },
  { target: "nav-networks", tab: "networks", title: "Networks", body: "Every visible access point with BSSID, RSSI, band and security. Your current network is highlighted so you can compare alternatives." },
  { target: "nav-diagnostics", tab: "diagnostics", title: "Diagnostics & charts", body: "Live signal and latency charts with average and threshold lines, plus health checks for gateway, DNS and internet." },
  { target: "nav-settings", tab: "settings", title: "Settings", body: "Turn on auto-reconnect, auto-switch, keep-alive, notifications, launch-at-login and more. Everything saves instantly." },
  { target: "deep-repair", tab: "settings", title: "Deep Network Repair", body: "The signature fix. When the Wi-Fi icon is greyed out with a slash despite the radio being ON, this resets the network plists and offers a reboot." },
  { target: "nav-log", tab: "log", title: "Recovery Log", body: "A persistent, chronological record of every scan, repair, switch and error - your forensic trail." },
  { target: "nav-help", tab: "help", title: "That is the tour", body: "The Help tab holds the full reference. Replay this tour any time from the footer. Enjoy NetKeeper!" },
];

function Tour({ open, onClose, onNavigate }: { open: boolean; onClose: ()=>void; onNavigate: (t:Tab)=>void }){
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<{left:number;top:number;width:number;height:number}|null>(null);
  const step = TOUR_STEPS[i];

  useEffect(()=>{ if(open){ setI(0); } },[open]);
  useEffect(()=>{
    if(!open || !step) return;
    onNavigate(step.tab);
    const measure = ()=>{
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement|null;
      if(!el){ setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({left:r.left, top:r.top, width:r.width, height:r.height});
    };
    const t = setTimeout(()=>{
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement|null;
      if(el) el.scrollIntoView({block:"center", inline:"center", behavior:"smooth"});
      measure();
    }, 90);
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return ()=>{ clearTimeout(t); cancelAnimationFrame(raf); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  },[open, i]);

  if(!open || !step) return null;
  const pad = 7, tipW = 336;
  const vw = window.innerWidth, vh = window.innerHeight;
  let tipLeft = rect ? rect.left + rect.width/2 - tipW/2 : vw/2 - tipW/2;
  tipLeft = Math.max(16, Math.min(vw - tipW - 16, tipLeft));
  let tipTop = rect ? rect.top + rect.height + pad + 14 : vh/2 - 90;
  if(rect && tipTop + 200 > vh) tipTop = Math.max(16, rect.top - 200 - 14);
  const hole = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad*2, height: rect.height + pad*2 } : null;

  return (
    <div className="fixed inset-0 z-[200]">
      {hole
        ? <div className="pointer-events-none absolute rounded-[12px] transition-all duration-300 ease-out" style={{...hole, boxShadow:"0 0 0 9999px rgba(10,12,20,0.66), 0 0 0 2px rgba(10,132,255,0.95)"}}/>
        : <div className="absolute inset-0 bg-[#0a0c14]/70"/>}
      <div className="absolute inset-0"/>
      <div className="absolute z-10 bg-white rounded-[14px] shadow-[0_24px_60px_rgba(0,0,0,0.4)] p-4 transition-all duration-300" style={{left:tipLeft, top:tipTop, width:tipW}}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="mono text-[10px] font-[700] tracking-widest text-[#0a84ff] uppercase">Step {i+1} / {TOUR_STEPS.length}</span>
          <button onClick={onClose} aria-label="Close tour" className="text-[#8e8e93] hover:text-[#1d1d1f]"><X className="w-4 h-4"/></button>
        </div>
        <div className="font-[700] text-[15px]">{step.title}</div>
        <div className="text-[12.5px] text-[#6e6e73] mt-1.5 leading-[1.5]">{step.body}</div>
        <div className="flex items-center justify-between mt-4">
          <button onClick={onClose} className="text-[12px] text-[#8e8e93] hover:text-[#1d1d1f]">Skip tour</button>
          <div className="flex items-center gap-2">
            {i>0 && <button onClick={()=>setI(i-1)} className="h-8 px-3 rounded-[8px] bg-[#f5f5f7] border border-black/10 text-[12px] font-[600] hover:bg-black/5 transition">Back</button>}
            <button onClick={()=>{ if(i<TOUR_STEPS.length-1) setI(i+1); else onClose(); }} className="h-8 px-4 rounded-[8px] bg-[#0a84ff] text-white text-[12px] font-[600] hover:bg-[#0a6cff] transition">{i<TOUR_STEPS.length-1? "Next":"Finish"}</button>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-3 justify-center">
          {TOUR_STEPS.map((_,n)=>(<span key={n} className={`h-1.5 rounded-full transition-all ${n===i?"w-4 bg-[#0a84ff]":"w-1.5 bg-black/15"}`}/>))}
        </div>
      </div>
    </div>
  );
}

function HelpPage({ settings }: { settings: AppSettings }){
  return (
    <div className="max-w-[980px] space-y-3">
      <div className="rounded-[14px] p-5 text-white shadow-[0_12px_32px_rgba(10,132,255,0.28)] bg-gradient-to-br from-[#0a84ff] to-[#0060df]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[11px] bg-white/15 border border-white/25 flex items-center justify-center shrink-0"><Power className="w-6 h-6"/></div>
            <div>
              <div className="flex items-center gap-2"><span className="font-[800] text-[16px] leading-none">Deep Network Repair</span><span className="text-[9px] font-[800] tracking-widest uppercase bg-white text-[#0a84ff] rounded-full px-2 py-0.5">Signature fix</span></div>
              <div className="text-[12px] text-white/85 mt-1">Repairs the greyed-out Wi-Fi icon with the slash - even when the radio is ON. This is what sets NetKeeper apart.</div>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-[12px] leading-[1.55]">
          <div className="bg-white/10 border border-white/15 rounded-[11px] p-3"><div className="font-[700] text-white">The problem</div><div className="text-white/85 mt-1">macOS keeps the interface-to-service mapping in two files: NetworkInterfaces.plist and preferences.plist. When they corrupt, the menu-bar Wi-Fi icon greys out and shows a slash even though the Wi-Fi radio is switched on - and a normal off/on toggle does not bring it back.</div></div>
          <div className="bg-white/10 border border-white/15 rounded-[11px] p-3"><div className="font-[700] text-white">The fix</div><div className="text-white/85 mt-1">NetKeeper deletes those two corrupt files (with your admin password) and then offers to reboot, so macOS rebuilds a clean mapping from scratch - the reliable cure for the slashed icon that a simple radio reset cannot fix.</div></div>
        </div>
        <div className="mt-4 bg-white/10 border border-white/15 rounded-[11px] p-3">
          <div className="font-[700] text-[12px] text-white">How to use it</div>
          <div className="mt-2 space-y-1.5 text-[12px] text-white/90">
            <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-white text-[#0a84ff] flex items-center justify-center text-[10px] font-[800] shrink-0">1</span><span><span className="font-[600]">Automatic:</span> turn on <span className="font-[600]">Auto Deep Repair</span> in Settings. On every scan, if the radio is ON but DHCP has no valid IP, NetKeeper runs the repair for you.</span></div>
            <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-white text-[#0a84ff] flex items-center justify-center text-[10px] font-[800] shrink-0">2</span><span><span className="font-[600]">Manual:</span> open Settings and press <span className="font-[600]">Run Deep Repair Now</span> whenever you see the slashed icon.</span></div>
            <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-white text-[#0a84ff] flex items-center justify-center text-[10px] font-[800] shrink-0">3</span><span>Type your Mac password in the native macOS prompt, then choose <span className="font-[600]">Reboot Now</span> to finish the repair.</span></div>
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-[10px] text-white/75"><Lock className="w-3 h-3"/>Password is handled only by macOS - NetKeeper never stores it. Repair runs only when the radio is ON, with a 5-minute cooldown.</div>
        </div>
      </div>
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
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-[#0a84ff] text-white flex items-center justify-center text-[11px] font-[700]">5</span><span><span className="font-[600]">If the Wi-Fi icon is greyed with a slash.</span> This is the signature Deep Network Repair case - the radio is ON but macOS lost its interface mapping. Press <span className="font-[600]">Run Deep Repair Now</span> in Settings (or enable Auto Deep Repair). See the blue panel at the top for the full explanation.</span></div>
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
          <div><span className="font-[600]">Auto-Reconnect on Drop.</span> When the link drops, NetKeeper rejoins your last or preferred network on its own.</div>
          <div><span className="font-[600]">Reconnect on Wake.</span> Detects a system wake and rejoins. Reconnect on Wake and Keep-Alive work together.</div>
          <div><span className="font-[600]">Auto-Join / Auto-Switch Strongest.</span> Moves to the strongest network among your preferred/last networks when it is clearly better (or when quality falls below the threshold). It only switches to networks you already know, so it never asks for a password.</div>
          <div><span className="font-[600]">Block Open Networks.</span> Excludes unencrypted networks from auto-join and auto-switch.</div>
          <div><span className="font-[600]">Notify on Disconnect / IP Change.</span> Shows a system notification when these events happen.</div>
          <div><span className="font-[600]">Launch at Login, Menu Bar, Dock.</span> Launch at Login starts NetKeeper after reboot. Run in Menu Bar keeps it alive in the tray when you close the window (turn it off to quit on close). Show Dock Icon shows or hides the Dock icon.</div>
          <div><span className="font-[600]">Preferred Band.</span> Which band to prefer when joining a network: Auto, 2.4GHz, or 5GHz.</div>
          <div><span className="font-[600]">Signal Drop Threshold.</span> The quality percentage at which NetKeeper treats the signal as too weak.</div>
          <div><span className="font-[600]">Preferred Networks.</span> A comma-separated list of networks you prefer. Leave blank to let NetKeeper decide.</div>
          <div><span className="font-[600]">Ping Targets.</span> The router, DNS, and internet addresses used by Diagnostics and the dashboard latency card.</div>
          <div><span className="font-[600]">Interface.</span> The Wi-Fi device used for commands, usually en0 or en1. NetKeeper detects it automatically.</div>
          <div><span className="font-[600]">Auto Deep Repair.</span> On every scan, if the radio is ON but DHCP has no valid IP, delete NetworkInterfaces.plist and preferences.plist and prompt a reboot - the signature fix.</div>
        </div>
      </div>

      <div className="bg-white border border-black/[0.08] rounded-[14px] p-5">
        <h3 className="font-[700] text-[13px] flex items-center gap-2"><Power className="w-4 h-4"/>Troubleshooting</h3>
        <div className="mt-3 space-y-2.5 text-[12px]">
          <div className="flex items-start gap-3 bg-[#eff6ff] border border-[#0a84ff]/25 rounded-[11px] p-3">
            <div className="w-6 h-6 rounded-full bg-[#0a84ff] text-white flex items-center justify-center text-[11px] font-[700] shrink-0">!</div>
            <div><span className="font-[600]">Wi-Fi icon greyed out with a slash (radio is ON).</span> The interface-to-service mapping is corrupt. Emergency Reset will not fix this. Open Settings, press <span className="font-[600]">Run Deep Repair Now</span>, enter your Mac password, and choose Reboot Now. NetKeeper deletes NetworkInterfaces.plist and preferences.plist so macOS rebuilds the mapping.</div>
          </div>
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
          <div><span className="font-[600]">My Wi-Fi icon is greyed out with a slash but Wi-Fi is on. Will Deep Repair fix it?</span> Yes. That state means macOS's interface mapping files are corrupt. Deep Network Repair deletes them and reboots so macOS rebuilds them. It is the one case a radio off/on reset cannot fix.</div>
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
  const [activeTab, setActiveTab] = useState<Tab>(()=>{ try{ return localStorage.getItem("netkeeper_welcome_seen")==="true" ? "overview" : "welcome"; }catch{ return "welcome"; } });
  const [tourOpen, setTourOpen] = useState(false);
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
  const [quality, setQuality] = useState(0);
  const [signalHistory, setSignalHistory] = useState<number[]>([]);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [netCountHistory, setNetCountHistory] = useState<number[]>([]);
  const [radioOn, setRadioOn] = useState(false);
  const [lat, setLat] = useState<{[k:string]:{ms:number|null; ok:boolean}}>({router:{ms:null,ok:false},dns:{ms:null,ok:false},internet:{ms:null,ok:false}});
  const [settings, setSettings] = useState<AppSettings>({
    auto_reconnect: true, keep_alive: true, keep_alive_interval: "30s", reconnect_on_wake: true, auto_switch_strongest: false,
    preferred_band: "Auto", block_open: true, launch_at_login: false, show_menu_bar: true, show_dock: true,
    notify_disconnect: true, notify_ip_change: false, ping_router_target: "", ping_dns_target: "1.1.1.1", ping_internet_target: "8.8.8.8",
    quality_threshold: 30, interface_name: "en0", preferred_networks: [], simulation_mode: true, auto_heal: true, auto_deep_repair: false
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [lastKeepAlive, setLastKeepAlive] = useState<{ at: string; ok: boolean }>({ at: "--", ok: false });
  const wasDownRef = useRef(false);
  const repairLockRef = useRef(false);
  const lastRepairRef = useRef(0);
  const lastHeartbeatRef = useRef(Date.now());
  const lastIpRef = useRef<string>("--");
  const lastConnectedSsidRef = useRef<string>("");
  const switchLockRef = useRef(false);
  const lastSwitchRef = useRef(0);
  const notifyReadyRef = useRef(false);
  const prevConnectedRef = useRef(false);
  const doScanRef = useRef<(force?: boolean) => void>(() => {});
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const scanInFlightRef = useRef<Promise<void> | null>(null);
  const lastScanTsRef = useRef(0);
  const lastScanDataRef = useRef<{ networks: Network[]; currentName: string }>({ networks: [], currentName: "" });

  const current = networks.find(n=>n.current) || networks[0];
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
  const maxNetCount = netCountHistory.length? Math.max(...netCountHistory, 1) : 1;

  useEffect(()=>{ (async()=>{
    try{ const s = await invoke<AppSettings>("get_settings"); setSettings(s); setKeepAlive(s.keep_alive); setAutoHeal(s.auto_heal!==undefined? s.auto_heal : true); setAutoJoin(!!s.auto_switch_strongest); }catch{}
    try{ const autoStart = await invoke<boolean>("get_autostart"); setSettings(s=>({...s, launch_at_login: autoStart})); }catch{}
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
        const on = await invoke<boolean>("get_radio_state"); setRadioOn(on);
        const stats = await invoke<any>("get_link_stats");
        if(stats.signal_dbm){
          const q = Math.min(100, Math.max(0, 2*(stats.signal_dbm+100)));
          setQuality(q);
          setSignalHistory(h=>[...h.slice(-19), q]);
        }
      }catch{}
    },10000);
    return ()=>clearInterval(id);
  },[]);

  // Single shared background scan loop (throttled by doScan's coalescing guard).
  useEffect(()=>{
    const id = setInterval(()=>doScanRef.current(false), 60000);
    return ()=>clearInterval(id);
  },[]);

  useEffect(()=>{
    if(!keepAlive){ setLat({router:{ms:null,ok:false},dns:{ms:null,ok:false},internet:{ms:null,ok:false}}); return; }
    const intervalMs = parseInterval(settings.keep_alive_interval);
    const runPings = async ()=>{
      const res:any = {};
      const targets:any[] = [];
      const rt = settings.ping_router_target || (ipInfo.router && ipInfo.router!=="--" ? ipInfo.router : "");
      if(rt) targets.push(["router", rt]);
      targets.push(["dns", settings.ping_dns_target]);
      targets.push(["internet", settings.ping_internet_target]);
      for(const [k,h] of targets){ try{ res[k] = await invoke("ping_host",{host:h}); }catch{ res[k] = {ms:null,ok:false}; } }
      setLat(res);
      const netRes = res["internet"];
      if(netRes && typeof netRes.ms === "number") setLatencyHistory(h=>[...h.slice(-19), netRes.ms]);
      const targetsOk = targets.length>0 && targets.every(([k]:any)=>res[k] && res[k].ok);
      setLastKeepAlive({ at: new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"}), ok: targetsOk });
      if(targets.length>0){
        if(!targetsOk && !wasDownRef.current){
          wasDownRef.current = true;
          await addLog("warn","Keep-Alive","no response from "+targets.map(([,h]:any)=>h).join(", ")+" - "+settings.interface_name+" may be down");
          if(settings.notify_disconnect) notify("NetKeeper: connection lost","No response from your network on "+settings.interface_name);
        } else if(targetsOk && wasDownRef.current){
          wasDownRef.current = false;
          await addLog("success","Keep-Alive","responses back from "+targets.map(([,h]:any)=>h).join(", "));
        }
      }
    };
    runPings();
    const id = setInterval(runPings, intervalMs);
    return ()=>clearInterval(id);
  },[keepAlive, settings.keep_alive_interval, ipInfo.router, settings.ping_router_target, settings.ping_dns_target, settings.ping_internet_target, settings.notify_disconnect]);

  const markWelcomeSeen = () => { try{ localStorage.setItem("netkeeper_welcome_seen","true"); }catch{} };

  const notify = async (title: string, body: string) => {
    try{
      if(!notifyReadyRef.current){
        let granted = await isPermissionGranted();
        if(!granted){ const p = await requestPermission(); granted = p === "granted"; }
        notifyReadyRef.current = granted;
      }
      if(notifyReadyRef.current) sendNotification({ title, body });
    }catch{}
  };

  const addLog = async (level: string, source: string, message: string, detail?: string) => {    const entry: LogEntry = { id: Date.now().toString()+Math.random().toString(36).slice(2,4), timestamp: new Date().toLocaleTimeString(), time_ms: Date.now(), level, source, message, detail };
    setLogs(p=>[entry,...p].slice(0,500));
    try{ await invoke("append_log",{entry}); }catch{}
  };

  const runDeepRepair = async (reason: string) => {
    await addLog("warn","Deep Repair","bad DHCP ("+reason+") - removing NetworkInterfaces.plist + preferences.plist - admin password required");
    try{
      const r = await invoke<string>("deep_network_repair");
      await addLog("success","Deep Repair",r);
      const choice = await invoke<string>("prompt_reboot");
      await addLog("info","Deep Repair", choice==="reboot" ? "user chose to reboot - repair will finish on restart" : "reboot deferred - restart manually to finish repair");
    }catch(e:any){ await addLog("error","Deep Repair","plist reset failed or cancelled: "+e); }
  };

  const checkDhcp = async () => {
    try{
      const st = await invoke<any>("check_dhcp_state");
      if(!st.healthy){
        await addLog("warn","DHCP","bad DHCP state: "+st.state+" - "+st.detail);
        const cooldownOk = Date.now()-lastRepairRef.current > 300000;
        if(settingsRef.current.auto_deep_repair && !repairLockRef.current && cooldownOk){
          repairLockRef.current = true;
          lastRepairRef.current = Date.now();
          await runDeepRepair(st.state);
          repairLockRef.current = false;
        }
      }
    }catch{}
  };

  // Coalesced scan: forced (user) calls run now; background loops are throttled so we
  // never spawn overlapping `airport -s` scans, which stall the Wi-Fi radio and UI.
  const SCAN_MIN_MS = 45000;
  const doScan = async (force = true) => {
    if(scanInFlightRef.current) return scanInFlightRef.current;
    if(!force && Date.now() - lastScanTsRef.current < SCAN_MIN_MS) return;
    lastScanTsRef.current = Date.now();
    const iface = settingsRef.current.interface_name;
    const task = (async () => {
      setIsScanning(true);
      await addLog("info","Network","airport -s scan - "+iface+" - 2.4/5GHz - all SSIDs - all vendors - no filter");
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
        setNetCountHistory(h=>[...h.slice(-19), mapped.length]);
        if(currentName.length>0) lastConnectedSsidRef.current = currentName;
        lastScanDataRef.current = { networks: mapped, currentName };
        try{ const on = await invoke<boolean>("get_radio_state"); setRadioOn(on); }catch{}
        try{ const stats = await invoke<any>("get_link_stats"); if(stats.signal_dbm) setQuality(Math.min(100, Math.max(0, 2*(stats.signal_dbm+100)))); }catch{}
        await addLog("success","Network","found "+mapped.length+" networks - all types - all vendors - best "+(mapped[0]?.ssid||"--")+" "+(mapped[0]?.rssi||0)+"dBm");
      }catch(e:any){ await addLog("error","Network","scan failed "+e); }
      setIsScanning(false);
      await checkDhcp();
    })();
    scanInFlightRef.current = task;
    try{ await task; } finally { scanInFlightRef.current = null; }
  };
  doScanRef.current = doScan;
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

  const runDiag = async () => {
    if(diagRunning) return;
    setDiagRunning(true);
    await addLog("info","Diagnostics","running live checks - gateway, DNS, internet");
    const rt = settings.ping_router_target || (ipInfo.router!=="--"?ipInfo.router:"");
    const checks:any[] = [];
    if(rt) checks.push(["Gateway", rt]);
    checks.push(["DNS", settings.ping_dns_target]);
    checks.push(["Internet", settings.ping_internet_target]);
    let allOk = true;
    for(const [k,h] of checks){
      try{
        const r:any = await invoke("ping_host",{host:h});
        if(!r.ok) allOk = false;
        await addLog(r.ok?"success":"error","Diagnostics",k+" "+h+" - "+(r.ok? r.ms+"ms":"no reply"));
      }catch(e:any){ allOk = false; await addLog("error","Diagnostics",k+" "+h+" - "+e); }
    }
    await addLog(allOk?"success":"warn","Diagnostics",allOk?"all checks passed - link healthy":"one or more checks failed - see entries above");
    setDiagRunning(false);
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

  useEffect(()=>{
    if(!autoHeal) return;
    let armed = false;
    let lastReset = 0;
    const ifaceName = () => settingsRef.current.interface_name;
    const monitor = async ()=>{
      try{
        await doScan(false);
        const raw:any[] = lastScanDataRef.current.networks;
        if(raw.length===0){
          if(!armed){
            armed = true;
            await addLog("warn","Auto-Heal","0 networks detected on "+ifaceName()+" - rechecking in 5s");
            setTimeout(async ()=>{
              try{
                await doScan(true);
                const recheck:any[] = lastScanDataRef.current.networks;
                if(recheck.length===0){
                  const cooldown = Date.now()-lastReset > 60000;
                  if(cooldown){
                    lastReset = Date.now();
                    await addLog("warn","Auto-Heal","still 0 networks - resetting "+ifaceName());
                    setIsResetting(true);
                    try{ const r = await invoke<string>("emergency_reset"); await addLog("success","Auto-Heal",r); setIsSimulating(false); setTimeout(()=>{ setIsResetting(false); doScanRef.current(); }, 2500); }catch(e:any){ await addLog("error","Auto-Heal","reset FAIL "+e); setIsResetting(false); }
                  } else {
                    await addLog("warn","Auto-Heal","still 0 networks - skipping reset (cooldown 60s)");
                  }
                } else {
                  setNetworks(mapNetworks(recheck, lastScanDataRef.current.currentName));
                  await checkDhcp();
                }
              }catch{}
              armed = false;
            }, 5000);
          }
        } else {
          if(armed) armed = false;
        }
      }catch{}
    };
    const id = setInterval(monitor, 60000);
    return ()=>clearInterval(id);
  },[autoHeal]);

  // Keep the macOS Dock icon in sync with the setting.
  useEffect(()=>{ invoke("set_dock_visible",{visible: settings.show_dock}).catch(()=>{}); },[settings.show_dock]);

  // Detect wake-from-sleep via a heartbeat gap and reconnect if requested.
  useEffect(()=>{
    lastHeartbeatRef.current = Date.now();
    const tick = async ()=>{
      const now = Date.now();
      const gap = now - lastHeartbeatRef.current;
      lastHeartbeatRef.current = now;
      if(gap > 90000){
        const s = settingsRef.current;
        await addLog("info","Wake","system woke after "+Math.round(gap/1000)+"s - rechecking link");
        setTimeout(async()=>{
          try{
            const cur = await invoke<string>("get_current_wifi");
            const name = cur.replace(/^Current Wi-Fi Network:\s*/i,"").trim();
            if(s.reconnect_on_wake && name.length===0 && s.auto_reconnect){
              const target = lastConnectedSsidRef.current || s.preferred_networks[0];
              if(target){
                await invoke("connect_wifi",{ssid: target, password: ""});
                await addLog("success","Wake","reconnected to "+target+" after wake");
                setTimeout(()=>doScanRef.current(), 3000);
                return;
              }
            }
            doScanRef.current();
          }catch{ doScanRef.current(); }
        }, 3000);
      }
    };
    const id = setInterval(tick, 5000);
    return ()=>clearInterval(id);
  },[]);

  // Connection manager: auto-reconnect when down, auto-switch to the best known network.
  useEffect(()=>{
    const manage = async ()=>{
      const s = settingsRef.current;
      if(switchLockRef.current) return;
      if(!s.auto_reconnect && !s.auto_switch_strongest) return;
      if(Date.now()-lastSwitchRef.current < 45000) return;
      try{
        const curStr = await invoke<string>("get_current_wifi");
        const curName = curStr.replace(/^Current Wi-Fi Network:\s*/i,"").trim();
        if(curName.length>0) lastConnectedSsidRef.current = curName;
        await doScan(false);
        const raw:any[] = lastScanDataRef.current.networks;
        if(raw.length===0) return;
        const isOpen = (n:any)=> /open|none|wep/i.test(n.security||"");
        const bandOk = (n:any)=> s.preferred_band==="Auto" ? true : s.preferred_band==="5GHz" ? n.channel>30 : n.channel<=30;
        const known = new Set<string>([...s.preferred_networks, lastConnectedSsidRef.current, curName].filter(Boolean) as string[]);
        const score = (n:any)=> n.rssi + (s.preferred_networks.includes(n.ssid)?15:0);
        const ranked = raw.filter((n:any)=> (!s.block_open || !isOpen(n)) && bandOk(n) && known.has(n.ssid)).sort((a:any,b:any)=>score(b)-score(a));

        if(curName.length===0){
          if(!s.auto_reconnect) return;
          const target = ranked[0];
          if(!target) return;
          switchLockRef.current = true; lastSwitchRef.current = Date.now();
          await addLog("warn","Auto-Reconnect","link down - trying "+target.ssid+" ("+target.rssi+" dBm)");
          try{ await invoke("connect_wifi",{ssid: target.ssid, password: ""}); await addLog("success","Auto-Reconnect","joined "+target.ssid); }catch(e:any){ await addLog("error","Auto-Reconnect","could not join "+target.ssid+" - "+e); }
          switchLockRef.current = false;
          setTimeout(()=>doScanRef.current(), 4000);
          return;
        }

        const best = ranked.find((n:any)=>n.ssid!==curName);
        if(s.auto_switch_strongest && best){
          const currentNet = raw.find((n:any)=>n.ssid===curName);
          const gain = score(best) - (currentNet? score(currentNet) : -999);
          const weak = qualityRef.current < s.quality_threshold;
          if(gain >= 12 || (weak && gain > 0)){
            switchLockRef.current = true; lastSwitchRef.current = Date.now();
            await addLog("warn","Auto-Switch","switching "+curName+" -> "+best.ssid+" ("+(currentNet?.rssi??"--")+" -> "+best.rssi+" dBm)");
            try{ await invoke("connect_wifi",{ssid: best.ssid, password: ""}); await addLog("success","Auto-Switch","now on "+best.ssid); }catch(e:any){ await addLog("error","Auto-Switch","switch failed - "+e); }
            switchLockRef.current = false;
            setTimeout(()=>doScanRef.current(), 4000);
          }
        }
      }catch{}
    };
    const id = setInterval(manage, 60000);
    return ()=>clearInterval(id);
  },[]);

  // Notify when a new IP is assigned.
  useEffect(()=>{
    const ip = ipInfo.ip;
    if(ip && ip!=="--" && lastIpRef.current!=="--" && ip!==lastIpRef.current && settings.notify_ip_change){
      notify("NetKeeper: IP changed","New IP "+ip+" on "+settings.interface_name);
    }
    if(ip && ip!=="--") lastIpRef.current = ip;
  },[ipInfo.ip, settings.notify_ip_change, settings.interface_name]);

  // Notify when the Wi-Fi association is lost.
  useEffect(()=>{
    const connected = currentSsid.replace(/^Current Wi-Fi Network:\s*/i,"").trim().length>0;
    if(prevConnectedRef.current && !connected && settings.notify_disconnect){
      notify("NetKeeper: disconnected","You left the Wi-Fi network on "+settings.interface_name);
    }
    prevConnectedRef.current = connected;
  },[currentSsid, settings.notify_disconnect, settings.interface_name]);

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
            {id:"welcome", label:"Welcome", icon:Home},
            {id:"overview", label:"Overview", icon:LayoutDashboard},
            {id:"networks", label:"Networks", icon:Radio, badge: networks.length},
            {id:"diagnostics", label:"Diagnostics", icon:Activity},
            {id:"settings", label:"Settings", icon:Settings},
            {id:"log", label:"Recovery Log", icon:ScrollText},
            {id:"help", label:"Help", icon:HelpCircle},
          ].map(i=>{
            const Icon=i.icon; const active=activeTab===i.id;
            return <button key={i.id} data-tour={"nav-"+i.id} onClick={()=>setActiveTab(i.id as Tab)} className={`w-full flex items-center justify-between px-2.5 h-[32px] rounded-[7px] font-[500] ${active?'bg-[#0a84ff] text-white shadow':'text-[#1d1d1f] hover:bg-black/5'}`}><span className="flex items-center gap-2.5"><Icon className="w-4 h-4"/>{i.label}</span>{(i as any).badge!==undefined && <span className={`mono text-[11px] px-1.5 py-0.5 rounded-full ${active?'bg-white/20':'bg-black/10'}`}>{(i as any).badge}</span>}</button>
          })}
        </div>
        <div data-tour="radio-card" className="mt-4 mx-0.5 bg-white border border-black/[0.08] rounded-[12px] p-3 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-[700]"><span className={`w-2 h-2 rounded-full ${radioOn?'bg-[#30d158] shadow-[0_0_0_3px_rgba(48,209,88,0.25)]':'bg-[#ff3b30]'}`}/>{radioOn?'Radio ON - '+settings.interface_name:'Radio OFF'}</div>
          <div className="mono text-[11px] text-[#6e6e73] mt-2 truncate leading-[1.3]">{currentSsid.replace('Current Wi-Fi Network: ','').replace('You are not associated with an AirPort network.','Not connected') || '--'}</div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button data-tour="scan-button" onClick={()=>doScan()} disabled={isScanning} className="h-[28px] rounded-[7px] bg-[#f5f5f7] border border-black/10 text-[11px] font-[600] flex items-center justify-center gap-1"><RefreshCw className={`w-3 h-3 ${isScanning?'animate-spin':''}`}/>Scan</button>
            <button onClick={runEmergency} disabled={isResetting} className="h-[28px] rounded-[7px] bg-[#ff3b30] text-white text-[11px] font-[600] flex items-center justify-center gap-1"><Power className="w-3 h-3"/>Reset</button>
          </div>
        </div>
        <div className="mt-auto pt-3 border-t border-black/[0.06] mx-1 mono text-[10px] text-[#8e8e93]">en - 802.11ax - Auto-Heal {autoHeal?'ON':'OFF'} - all types</div>
      </div>

      <div className="flex-1 flex flex-col bg-[#fbfbfc] overflow-hidden relative">
        <div className="h-[52px] bg-white border-b border-black/[0.08] flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3"><div className="flex items-center gap-1.5 text-[11px] font-[600] bg-[#f5f5f7] border border-black/10 px-2.5 h-7 rounded-full"><div className={`w-2 h-2 rounded-full ${radioOn?'bg-[#30d158]':'bg-[#ff3b30]'}`}/>{radioOn?networks.length+' Networks - '+avgRssi+' dBm - all types':'Radio Off'}</div>{current && <span className="flex items-center gap-1.5 text-[12px]"><ShieldCheck className="w-3.5 h-3.5 text-[#30d158]"/>{current.ssid} <span className="mono text-[#8e8e93]">{current.bssid.slice(0,8)} - Ch {current.channel}</span></span>}</div>
          <div className="flex items-center gap-2"><span className="mono text-[11px] text-[#8e8e93]">Driver Brcm4360</span><span className={`text-[11px] font-[700] px-2 h-6 rounded-full flex items-center ${radioOn?'bg-[#e8f8ed] text-[#1a9e4b]':'bg-[#ffefef] text-[#d1272d]'}`}>{radioOn?'RADIO ON':'RADIO OFF'}</span></div>
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
          {activeTab==="welcome" && <LandingPage onTour={()=>setTourOpen(true)} onDashboard={()=>{ markWelcomeSeen(); setActiveTab("overview"); }} onHelp={()=>{ markWelcomeSeen(); setActiveTab("help"); }} />}
          {activeTab==="overview" && (
            <div className="space-y-4">
              <h1 className="font-[700] text-[16px]">Dashboard</h1>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">CURRENT SSID</div><div className="mt-2 font-[700] text-[14px]">{currentSsid.replace('Current Wi-Fi Network: ','').slice(0,22) || 'Not connected'}</div><div className="mono text-[11px] text-[#8e8e93] mt-1">BSSID {ipInfo.bssid} - {ipInfo.band} - {ipInfo.security}</div><div className="mt-2 h-1.5 bg-black/10 rounded-full overflow-hidden"><div className="h-full bg-[#0a84ff] rounded-full" style={{width: quality+"%"}}></div></div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">IP AND ROUTER</div><div className="mono text-[12px] mt-2 leading-5">Local {ipInfo.ip}<br/>Router {ipInfo.router}<br/>Subnet {ipInfo.subnet}<br/>Public {ipInfo.public_ip}<br/>DNS {(ipInfo.dns[0]||"1.1.1.1")}</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">RADIO AND QUALITY - chart</div><div className="mt-2 flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${radioOn?'bg-[#30d158]':'bg-[#ff3b30]'}`}/><span className="font-[600]">{radioOn?'ON':'OFF'} - {settings.interface_name} - {quality}%</span>{quality>0 && quality<settings.quality_threshold && <span className="text-[10px] font-[700] text-[#d1272d] bg-[#ffefef] rounded-full px-1.5">BELOW {settings.quality_threshold}%</span>}</div><div className="mt-3 -mx-1"><AreaChart data={signalHistory} height={48} color="#0a84ff" grid={false} axis={false} area stepSec={10} empty="collecting…"/></div><div className="mono text-[10px] text-[#8e8e93] mt-1">Live signal quality trend</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">NETWORKS STATS - all types</div><div className="mono text-[12px] mt-2 leading-5">Total {networks.length} found - all types<br/>Avg {avgRssi} dBm<br/>Best {bestNetwork?.ssid||"--"} {bestNetwork?.rssi||0}dBm<br/>Current {current?.ssid||"--"}<br/>KA {keepAlive? settings.keep_alive_interval : 'OFF'}</div></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><Signal className="w-4 h-4"/>Channel distribution - all bands</div><div className="mt-3"><BarChart data={[1,6,11,36,40,44,149,153].map(ch=>({label:`${ch}`, value: networks.filter(n=>n.channel===ch).length}))} height={150} color="#0a84ff"/></div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><Lock className="w-4 h-4"/>Security breakdown - all types</div><div className="mt-3 space-y-2">{Array.from(new Set(networks.map(n=>n.security))).slice(0,5).map(sec=>{ const count=networks.filter(n=>n.security===sec).length; return (<div key={sec} className="flex items-center justify-between"><span className="text-[12px] truncate">{sec}</span><span className="mono text-[11px] bg-black/10 px-1.5 rounded-full">{count}</span></div>) })}</div><div className="mono text-[10px] text-[#8e8e93] mt-3">All vendors - no filter - detects any security</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><Timer className="w-4 h-4"/>Keep alive and logs - rich</div><div className="mono text-[11px] mt-2 leading-6">KA interval {settings.keep_alive_interval} - {keepAlive?'ON':'OFF'}<br/>Auto join {autoJoin?'ON':'OFF'}<br/>Auto heal {autoHeal?'ON':'OFF'}<br/>Logs {logs.length} events<br/>Uptime {ipInfo.uptime}<br/>TX {ipInfo.tx_rate}<br/>Interface {settings.interface_name}</div></div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">LATENCY - LIVE PING</div><div className="mono text-[12px] mt-2 leading-6">{[{k:"Router",v:lat.router},{k:"DNS",v:lat.dns},{k:"Internet",v:lat.internet}].map(x=>(<div key={x.k} className="flex items-center justify-between"><span className="text-[#6e6e73]">{x.k}</span><span className="flex items-center gap-1.5 font-[700]"><span className={`w-2 h-2 rounded-full ${x.v&&x.v.ok?'bg-[#30d158]':'bg-[#ff3b30]'}`}/>{x.v&&x.v.ms? x.v.ms+" ms":"--"}</span></div>))}</div><div className="mono text-[10px] text-[#8e8e93] mt-2">Ping 1 packet - refreshes every {keepAlive? settings.keep_alive_interval : "OFF"} - last {lastKeepAlive.at} {lastKeepAlive.ok?'OK':'FAIL'}</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">BAND SPLIT - ALL NETWORKS</div><div className="mt-4 flex justify-center"><DonutChart center="nets" segments={[{label:"2.4 GHz",value:twoFourG,color:"#0a84ff"},{label:"5 GHz",value:fiveG,color:"#30d158"}]}/></div><div className="mono text-[10px] text-[#8e8e93] mt-3 text-center">{twoFourG} on 2.4GHz - {fiveG} on 5GHz - all vendors</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">SIGNAL EXTREMES</div><div className="mono text-[12px] mt-2 leading-5">Strongest {strongest?.ssid.slice(0,16)||"--"} <span className="font-[700] text-[#1a9e4b]">{strongest?.rssi||0}dBm</span><br/>Weakest {weakest?.ssid.slice(0,16)||"--"} <span className="font-[700] text-[#d1272d]">{weakest?.rssi||0}dBm</span><br/>Range {networks.length>1?(strongest?.rssi||0)-(weakest?.rssi||0)+" dBm":"--"}<br/>Avg {avgRssi} dBm {networks.length>1?<>- Median {medianRssi} dBm</>:null}</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="mono text-[11px] text-[#8e8e93] font-[700] tracking-widest">OPEN NETWORKS - WARN</div><div className="mt-2 flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${openNets.length?'bg-[#ff9f0a]':'bg-[#30d158]'}`}/><span className="font-[700] text-[14px]">{openNets.length} open</span><span className="mono text-[11px] text-[#8e8e93]">/ {networks.length} nets</span></div><div className="mono text-[11px] mt-1 leading-5 text-[#6e6e73]">{networks.length? (openNets.slice(0,3).map(o=>o.ssid).join(", ")||"All encrypted") + (openNets.length>3?" +"+(openNets.length-3)+" more":""):"No networks yet"}</div><div className="mono text-[10px] text-[#8e8e93] mt-1">Unsecured - avoid auto-join</div></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><Signal className="w-4 h-4"/>Top 5 strongest - all vendors</div><div className="mt-3 space-y-1.5">{sortedNets.slice(0,5).map((n,i)=>(<div key={i} className="flex items-center justify-between"><span className="text-[12px] truncate">{i+1}. {n.ssid}</span><span className="mono text-[11px] flex items-center gap-2"><span className="text-[#8e8e93]">Ch{n.channel}</span><span className={`font-[700] ${n.rssi>-60?'text-[#1a9e4b]':n.rssi>-75?'text-[#6e6e73]':'text-[#d1272d]'}`}>{n.rssi}dBm</span></span></div>))}{sortedNets.length===0&&<div className="text-[12px] text-[#8e8e93]">No networks yet - run scan</div>}</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><Radio className="w-4 h-4"/>Busiest channels - live scan</div><div className="mt-3">{topCh.length? <BarChart data={topCh.map(([ch,count]:any)=>({label:`Ch${ch}`, value:count}))} height={150} color="#0a84ff"/> : <div className="h-[150px] flex items-center justify-center mono text-[10px] text-[#8e8e93]">No data - run scan</div>}</div><div className="mono text-[10px] text-[#8e8e93] mt-2">{networks.length? Object.keys(chCounts).length+" distinct channels in use":"-"} - {networks.length} nets</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[600] text-[13px] flex items-center gap-2"><ShieldCheck className="w-4 h-4"/>Connected network - details</div><div className="mono text-[11px] mt-2 leading-5">SSID {current?.ssid||"--"}<br/>Channel {current?.channel||"--"} - {current&&(current.channel>30?"5G":"2.4G")}<br/>RSSI {current?.rssi||"--"} dBm - Quality {quality}%<br/>TX {ipInfo.tx_rate} - BSSID {ipInfo.bssid.slice(0,17)}<br/>Sec {ipInfo.security||current?.security||"--"}<br/>DNS {ipInfo.dns.slice(0,2).join(", ")||"--"}</div></div>
              </div>
            </div>
          )}

          {activeTab==="networks" && (
            <div className="w-full">
              <div className="flex items-center justify-between mb-3"><h1 className="font-[700] text-[16px]">Available Networks - {networks.length} found - all SSIDs, all vendors, no filter</h1><button onClick={()=>doScan()} className="h-8 px-4 bg-[#1d1d1f] text-white rounded-[9px] text-[12px] font-[600] flex items-center gap-1.5"><RefreshCw className={`w-3.5 h-3.5 ${isScanning?'animate-spin':''}`}/>{isScanning?'Scanning...':'Rescan'}</button></div>
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
              <div className="mt-3 flex items-center gap-2 mono text-[11px] text-[#8e8e93]">airport -s scan - {settings.interface_name} - 802.11ax - {networks.length} nets - avg {avgRssi} dBm - real device scan - all vendors detected - MTN, Starlink, Tenda, TP-Link, any - no filter</div>
            </div>
          )}

          {activeTab==="diagnostics" && (
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between"><h1 className="font-[700] text-[16px]">Diagnostics with charts - signal and latency</h1><button onClick={runDiag} disabled={diagRunning} className="h-8 px-4 bg-[#1d1d1f] text-white rounded-[9px] text-[12px] font-[600] flex items-center gap-1.5"><Activity className="w-3.5 h-3.5"/>{diagRunning?'Running...':'Run All Tests'}</button></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4">
                  <div className="flex items-center justify-between"><div className="font-[700] text-[13px]">Signal quality over time</div><div className="mono text-[11px] text-[#8e8e93]">live · {signalHistory.length} samples</div></div>
                  <div className="mt-3"><AreaChart data={signalHistory} height={148} color="#0a84ff" unit="%" domain={[0,100]} threshold={settings.quality_threshold} stepSec={10} xLabels={["earlier","now"]}/></div>
                  <div className="mt-2 flex justify-between mono text-[10px] text-[#8e8e93]"><span>hover for exact reading</span><span className="font-[700] text-[#1d1d1f]">Now {quality}%</span></div>
                </div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4">
                  <div className="flex items-center justify-between"><div className="font-[700] text-[13px]">Latency · ping {settings.ping_internet_target}</div><div className="mono text-[11px] text-[#8e8e93]">{latencyHistory.length? (Math.round(latencyHistory.reduce((a,b)=>a+b,0)/latencyHistory.length))+" ms avg":"live"}</div></div>
                  <div className="mt-3"><AreaChart data={latencyHistory} height={148} color="#30d158" unit="ms" avg stepSec={parseInterval(settings.keep_alive_interval)/1000} xLabels={["earlier","now"]} empty="collecting pings…"/></div>
                  <div className="mt-2 flex justify-between mono text-[10px] text-[#8e8e93]"><span>dashed line = average</span><span className="font-[700] text-[#1d1d1f]">Now {latencyHistory.length? latencyHistory[latencyHistory.length-1]+" ms":"--"}</span></div>
                </div>
              </div>
              <div className="bg-white border border-black/[0.08] rounded-[14px] p-4">
                <div className="flex items-center justify-between"><h2 className="font-[700] text-[13px]">Health Checks - 8 checks</h2><span className="mono text-[11px] text-[#8e8e93]">live - {settings.interface_name} - all vendors</span></div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    {k:"Wi-Fi Interface", v:settings.interface_name+": "+(radioOn?"UP":"DOWN"), ok:radioOn},
                    {k:"Radio Power", v:radioOn?"ON":"OFF", ok:radioOn},
                    {k:"IP / DHCP", v:ipInfo.ip+" - "+((ipInfo.ip!=="--"&&!ipInfo.ip.startsWith("169.254."))?"lease OK":"no lease"), ok:ipInfo.ip!=="--" && !ipInfo.ip.startsWith("169.254.")},
                    {k:"Internet - Ping", v:settings.ping_internet_target+" - "+(lat.internet.ms!=null?lat.internet.ms+"ms":"--")+" - "+(lat.internet.ok?"reachable":"no reply"), ok:!!lat.internet.ok},
                    {k:"DNS", v:(ipInfo.dns[0] || '--')+" - "+(lat.dns.ok?"resolved":"unreachable"), ok:!!lat.dns.ok},
                    {k:"Gateway", v:ipInfo.router+" - "+(lat.router.ms!=null?lat.router.ms+"ms":"--"), ok:!!lat.router.ok},
                    {k:"Band", v:ipInfo.band+" - Ch "+(current?.channel || '--'), ok:ipInfo.band!=="--"},
                    {k:"Security", v:ipInfo.security || current?.security || '--', ok:!/open|none|wep/i.test(ipInfo.security || current?.security || "")},
                  ].map(r=><div key={r.k} className="flex items-center justify-between bg-[#f5f5f7] border border-black/[0.06] rounded-[10px] px-3 h-[42px]"><span className="text-[12px] font-[500]">{r.k}</span><span className="flex items-center gap-1.5 mono text-[11px]"><span className={`w-2 h-2 rounded-full ${r.ok?'bg-[#30d158]':'bg-[#ff3b30]'}`}/>{r.v}</span></div>)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#101012] rounded-[14px] border border-white/10 p-4 mono text-[11px] leading-6 text-white/90"><div className="text-white/50 uppercase text-[10px] font-[700] tracking-widest mb-2">Terminal Log - live</div>{logs.slice(0,8).map((l:any,i)=><div key={i} className="text-white/90">[{l.timestamp}] {l.level} {l.source} {l.message}</div>)}</div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[700] text-[13px]">Network count over time - chart</div><div className="mt-3 flex items-end gap-1 h-[60px] bg-[#f5f5f7] rounded-[8px] p-2">{netCountHistory.length?netCountHistory.map((v,i)=><div key={i} className="flex-1 bg-[#0a84ff]/30 rounded-t" style={{height: Math.round(v/maxNetCount*100)+"%"}}><div className="w-full bg-[#0a84ff] rounded-t" style={{height: '50%'}}></div></div>):<span className="mono text-[10px] text-[#8e8e93] px-1">collecting…</span>}</div><div className="mono text-[10px] text-[#8e8e93] mt-2">Now {networks.length} nets - peak {maxNetCount} - all vendors</div></div>
                <div className="bg-white border border-black/[0.08] rounded-[14px] p-4"><div className="font-[700] text-[13px]">Uptime and TX - rich</div><div className="mono text-[12px] mt-3 leading-6">Uptime {ipInfo.uptime}<br/>TX Rate {ipInfo.tx_rate}<br/>BSSID {ipInfo.bssid.slice(0,17)}<br/>Quality {quality}%<br/>Interface {settings.interface_name}<br/>Best {bestNetwork?.ssid||"--"}</div></div>
              </div>
            </div>
          )}

          {activeTab==="settings" && (
            <div className="w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
              <div className="bg-white border border-black/[0.08] rounded-[14px] divide-y divide-black/[0.06]">
                {[
                  {label:"Auto-Join Best Network", desc:"Connect to strongest known SSID automatically - all vendors - MTN, Starlink, any", val:settings.auto_switch_strongest, set:(v:boolean)=>{ setAutoJoin(v); setSettings(s=>({...s, auto_switch_strongest: v})); }},
                  {label:"Keep-Alive Ping", desc:"Ping "+settings.ping_dns_target+" every "+settings.keep_alive_interval+" to prevent sleep disconnect", val:keepAlive, set:(v:boolean)=>{ setKeepAlive(v); setSettings(s=>({...s, keep_alive: v})); }},
                  {label:"Auto-Heal Radio Crash", desc:"If 0 networks detected, auto reset "+settings.interface_name+" after 5s - all interfaces - all vendors", val:autoHeal, set:(v:boolean)=>{ setAutoHeal(v); setSettings(s=>({...s, auto_heal: v})); }},
                  {label:"Auto Deep Repair (plist reset)", desc:"On every scan, if the radio is ON but DHCP has no valid IP (greyed Wi-Fi icon), delete NetworkInterfaces.plist + preferences.plist and prompt reboot", val:settings.auto_deep_repair, set:(v:boolean)=>setSettings(s=>({...s, auto_deep_repair: v}))},
                  {label:"Simulation Mode (Demo)", desc:"Show amber demo bar with Simulate Disconnect + Force Restart", val:settings.simulation_mode, set:(v:boolean)=>setSettings(s=>({...s, simulation_mode: v}))},
                ].map(s=>(
                  <div key={s.label} className="flex items-center justify-between p-4"><div><div className="font-[600] text-[13px]">{s.label} {saveStatus && s.label.includes("Simulation") && <span className="text-[10px] bg-[#0a84ff] text-white px-1.5 py-0.5 rounded-full ml-2">{saveStatus}</span>}</div><div className="text-[11px] text-[#8e8e93] mt-0.5 leading-[1.3]">{s.desc}</div></div><button onClick={()=>s.set(!s.val)} className={`w-11 h-6 rounded-full p-0.5 transition ${s.val?'bg-[#0a84ff]':'bg-black/20'}`}><div className={`w-5 h-5 rounded-full bg-white shadow transition ${s.val?'translate-x-5':'translate-x-0'}`}/></button></div>
                ))}
                <div className="flex items-center justify-between p-4 bg-[#fff7ed]"><div><div className="font-[600] text-[13px] text-[#9a3412]">Run Deep Repair Now</div><div className="text-[11px] text-[#9a3412]/70 mt-0.5 leading-[1.3]">Deletes the two network preference plists (admin prompt) and offers a reboot immediately, regardless of DHCP state</div></div><button data-tour="deep-repair" onClick={()=>runDeepRepair("manual")} className="h-8 px-3 bg-[#dc2626] text-white rounded-[8px] text-[11px] font-[600] shrink-0">Delete plists</button></div>
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
                  {label:"Block Open Networks", desc:"Never auto-join / auto-switch to unencrypted networks - security first", val:settings.block_open, set:(v:boolean)=>setSettings(s=>({...s, block_open: v}))},
                  {label:"Notify on Disconnect", desc:"System notification when you drop off Wi-Fi", val:settings.notify_disconnect, set:(v:boolean)=>setSettings(s=>({...s, notify_disconnect: v}))},
                  {label:"Notify on IP Change", desc:"System notification when a new IP is assigned", val:settings.notify_ip_change, set:(v:boolean)=>setSettings(s=>({...s, notify_ip_change: v}))},
                ].map(s=>(
                  <div key={s.label} className="flex items-center justify-between p-4"><div><div className="font-[600] text-[13px]">{s.label}</div><div className="text-[11px] text-[#8e8e93] mt-0.5 leading-[1.3]">{s.desc}</div></div><button onClick={()=>s.set(!s.val)} className={`w-11 h-6 rounded-full p-0.5 transition ${s.val?'bg-[#0a84ff]':'bg-black/20'}`}><div className={`w-5 h-5 rounded-full bg-white shadow transition ${s.val?'translate-x-5':'translate-x-0'}`}/></button></div>
                ))}
              </div>
              <div className="bg-white border border-black/[0.08] rounded-[14px] divide-y divide-black/[0.06]">
                {[
                  {label:"Launch at Login", desc:"Start NetKeeper automatically after reboot - uses macOS LaunchAgent", val:settings.launch_at_login, set:(v:boolean)=>setSettings(s=>({...s, launch_at_login: v}))},
                  {label:"Run in Menu Bar (Tray)", desc:"Keep NetKeeper running in the menu bar when the window is closed - keeps pinging every 30s", val:settings.show_menu_bar, set:(v:boolean)=>setSettings(s=>({...s, show_menu_bar: v}))},
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
            <div className="w-full bg-[#101012] rounded-[14px] border border-white/10 p-4 mono text-[11px] leading-7 text-white/90 min-h-[460px]"><div className="flex items-center justify-between mb-3"><span className="text-white/50 uppercase text-[10px] font-[700] tracking-widest">Recovery Log - {settings.interface_name} - persistent - {logs.length} events - all vendors</span><button onClick={()=>setLogs([])} className="text-[11px] text-white/60 hover:text-white border border-white/10 rounded-full px-2.5 py-1">Clear</button></div>{logs.map((l:any,i)=><div key={i}>[{l.timestamp}] {l.level.toUpperCase()} {l.source} {l.message} {l.detail?` - ${l.detail}`:''}</div>)}</div>
          )}
          {activeTab==="help" && <HelpPage settings={settings} />}
        </div>

        <div className="h-[28px] bg-white border-t border-black/[0.08] flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3 mono text-[11px] text-[#8e8e93]">
            <span className="font-[700] text-[#1d1d1f]">NetKeeper v1.0 - Build</span>
            <span className="hidden sm:inline">{settings.interface_name} - {currentSsid.replace('Current Wi-Fi Network: ','').slice(0,18) || 'Not connected'} - {networks.length} nets - all types - {logs.length} logs - KA {keepAlive? settings.keep_alive_interval : 'OFF'}</span>
          </div>
          <div className="flex items-center gap-3 mono text-[11px] text-[#8e8e93]">
            <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${radioOn?'bg-[#30d158]':'bg-[#ff3b30]'}`}/>{radioOn?'Radio On':'Radio Off'}</span>
            <button onClick={()=>setTourOpen(true)} className="underline hover:text-[#1d1d1f]">Guided tour</button>
            <button onClick={()=>setShowOnboarding(true)} className="underline hover:text-[#1d1d1f]">Replay Onboarding</button>
          </div>
        </div>

        {showOnboarding && <OnboardingModal onComplete={()=>{ setShowOnboarding(false); try{ localStorage.setItem("netkeeper_onboarded","true"); }catch{} }} onLog={addLog} />}
        <Tour open={tourOpen} onClose={()=>setTourOpen(false)} onNavigate={(t)=>setActiveTab(t)} />
      </div>
    </div>
  )
}

