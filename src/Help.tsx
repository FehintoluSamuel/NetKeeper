import { ShieldCheck, Cpu } from "lucide-react";

export function HelpPage(){
  return (
    <div className="max-w- space-y-3">
      <div className="bg-white border border-black/[0.08] rounded- p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded- bg-[#0a84ff]/10 border border-[#0a84ff]/20 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-[#0a84ff]"/></div>
          <div><div className="font-[700] text-">Why does NetKeeper need Location - All networks</div><div className="text- text-[#8e8e93] mt-0.5">Same as onboarding, always accessible here - no MTN filter</div></div>
        </div>
        <div className="mt-4 text- leading-[1.6] text-[#1d1d1f]">
          macOS hides Wi-Fi scan results unless an app has Location permission. We run <span className="mono bg-[#f5f5f7] px-1.5 py-0.5 rounded border border-black/10">/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s</span> - it returns SSID, BSSID, RSSI, Channel, Security for all vendors. On some Macs BSSID column is missing (your 1 vs 3 bug) - we fixed parser to detect RSSI token (negative -60) instead of fixed column. Engine detects all SSIDs: MTN, Starlink, Tenda, TP-Link, iPhone, any.
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 mono text-">
          <div className="bg-[#f5f5f7] rounded- p-3 border border-black/[0.06]"><div className="font-[700]">What we scan</div><div className="mt-1 text-[#6e6e73]">airport -s - en - 2.4/5GHz - all types - all vendors - no filter</div></div>
          <div className="bg-[#f5f5f7] rounded- p-3 border border-black/[0.06]"><div className="font-[700]">What we store</div><div className="mt-1 text-[#6e6e73]">~/.config/netkeeper/settings.json + logs.jsonl - never leaves Mac - all vendors</div></div>
        </div>
      </div>

      <div className="bg-white border border-black/[0.08] rounded- p-5">
        <h3 className="font-[700] text- flex items-center gap-2"><Cpu className="w-4 h-4"/>Common Fixes - All networks</h3>
        <div className="mt-3 space-y-2.5 text-">
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text- font-[700]">1</span><span><span className="font-[600]">No networks - radio crashed:</span> macOS powered off en0 after wake. Use Emergency Reset - runs networksetup -setairportpower off/on</span></div>
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text- font-[700]">2</span><span><span className="font-[600]">Shows 1 instead of 3 networks:</span> Location not granted. Go to System Settings - Privacy - Location - Allow NetKeeper - then you see all vendors</span></div>
          <div className="flex gap-3"><span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text- font-[700]">3</span><span><span className="font-[600]">Slow internet but Wi-Fi connected:</span> Run Diagnostics - ping 8.8.8.8, 1.1.1.1, gateway 192.168.1.1 - checks DNS + driver Brcm4360 - charts show signal and latency</span></div>
        </div>
      </div>

      <div className="bg-[#f5f5f7] border border-black/[0.06] rounded- p-3 mono text- text-[#6e6e73] leading-[1.5]">
        NetKeeper v1.0 - Build - Interface en - 802.11ax - Keep-Alive 30s - Logs persistent in ~/.config/netkeeper/ - No data leaves Mac - All vendors: MTN, Starlink, Tenda, TP-Link, any SSID - No filter - Charts: signal quality and latency over time
      </div>
    </div>
  )
}