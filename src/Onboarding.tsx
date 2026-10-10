import { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { Wifi, ShieldCheck, Lock, Check } from "lucide-react";

interface Props { onComplete: () => void; onLog: (level:string, source:string, msg:string)=>void }

export function OnboardingModal({ onComplete, onLog }: Props){
  const [step, setStep] = useState<1|2>(1);
  const [granted, setGranted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGrant = async () => {
    setLoading(true);
    try{
      await invoke("scan_wifi");
      setGranted(true);
      setStep(2);
      onLog("success","Onboarding","Location granted - all networks visible - airport -s working - all vendors");
      try{ await invoke("set_onboarded"); localStorage.setItem("wikeep_onboarded","true"); }catch{}
    }catch(e){
      onLog("error","Onboarding",`Permission denied - showing 1 network bug: ${e}`);
      setGranted(false);
    }
    setLoading(false);
  };

  if(step===2){
    return (
      <div className="absolute inset-0 z-[100] bg-white/95 backdrop-blur- grid place-items-center p-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-[#1d1d1f] text-white grid place-items-center mb-4"><Check className="h-6 w-6"/></div>
          <div className="mono text- uppercase tracking-widest text-[#8e8e93]">All set</div>
          <h4 className="mt-1 text- font-[700] tracking-tight">Welcome to WiKeep</h4>
          <p className="mt-2 mono text- leading-[1.5] text-[#6e6e73] max-w- mx-auto">Monitoring all networks - Keep-Alive 30s - Logging to ~/.config/wikeep/ - No filter</p>
          <button onClick={onComplete} className="mt-5 h-8 px-4 rounded-full border border-black/10 bg-white mono text- hover:bg-[#fcfcfc]">Continue to App</button>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-[100] bg-[#fbfbfc]/90 backdrop-blur- flex items-center justify-center p-6">
      <div className="w- bg-white border border-black/[0.08] rounded- shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden">
        <div className="h- px-6 flex items-center border-b border-black/[0.06] bg-[#fcfcfc]">
          <div className="w-9 h-9 rounded- bg-[#0a84ff] shadow flex items-center justify-center text-white"><Wifi className="w- h-"/></div>
          <div className="ml-3"><div className="font-[700] text- leading-none">WiKeep</div><div className="mono text- text-[#8e8e93] mt-1">v1.0  - Build - Keep your WiFi alive - all vendors</div></div>
          <div className="ml-auto flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#30d158]"/><span className="mono text- text-[#8e8e93]">Secure</span></div>
        </div>
        <div className="p-7">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-[#0a84ff]/10 border border-[#0a84ff]/20 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-[#0a84ff]"/></div>
            <div className="flex-1">
              <h2 className="font-[700] text- leading-tight">Grant Wi-Fi Scanning Access - All networks</h2>
              <p className="text- text-[#6e6e73] mt-2 leading-[1.5]">WiKeep uses <span className="font-[600] text-[#1d1d1f] mono bg-[#f5f5f7] px-1 rounded">airport -s</span> to find all nearby networks. Detects any vendor: MTN, Starlink, Tenda, TP-Link, iPhone hotspot, any SSID. macOS requires Location permission to list networks - no tracking, data stays in <span className="mono bg-[#f5f5f7] px-1 rounded">~/.config/wikeep/</span></p>
              <div className="mt-4 grid grid-cols-[1fr_1fr] gap-3 text- mono">
                <div className="bg-[#f5f5f7] border border-black/10 rounded- p-2.5"><div className="font-[700] text-[#1d1d1f]">Step 1: System Prompt</div><div className="text-[#6e6e73] mt-1">Clicking Grant triggers native Location prompt</div></div>
                <div className="bg-[#f5f5f7] border border-black/10 rounded- p-2.5"><div className="font-[700] text-[#1d1d1f]">Step 2: Continue</div><div className="text-[#6e6e73] mt-1">Continue button turns blue #0a84ff after granted</div></div>
              </div>
              <div className="mt-4 flex gap-2">
                <button disabled={loading} onClick={handleGrant} className={`h-10 px-5 rounded- text- font-[600] flex items-center gap-2 ${granted?'bg-[#30d158] text-white':'bg-[#0a84ff] text-white hover:bg-[#0066cc]'}`}><Check className="w-4 h-4"/>{loading?'Requesting...':granted?'Granted':'Grant Wi-Fi Access - all networks'}</button>
                <button onClick={()=>{ try{ localStorage.setItem("wikeep_onboarded","true"); }catch{}; onComplete(); }} className="h-10 px-4 bg-white border border-black/10 rounded- text- font-[500]">Skip - Demo 1 network bug</button>
              </div>
              <div className="mt-3 mono text- text-[#8e8e93] flex items-center gap-1"><Lock className="w-3 h-3"/>No data leaves your Mac. Logs stored locally in ~/.config/wikeep/logs.jsonl - All vendors supported</div>
            </div>
          </div>
        </div>
        <div className="px-7 py-3 border-t border-black/[0.06] bg-[#fcfcfc] flex items-center justify-between">
          <span className="mono text- text-[#8e8e93]">CARD 520PX - 16PX RADIUS - SHADOW XL</span>
          <span className="mono text- text-[#8e8e93]">White cards / black/10 / 14px / Geist Mono - All vendors</span>
        </div>
      </div>
    </div>
  )
}