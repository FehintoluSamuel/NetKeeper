
const invoke = window.__TAURI__.tauri.invoke;
let networks = []; let selected = null;
async function refresh(){
  const dot=document.getElementById('statusDot'); if(dot) dot.className='dot scanning';
  try{ const info=JSON.parse(await invoke('get_wifi_info')); document.getElementById('ssidVal').textContent=info.ssid.replace('SSID: ','')||'--'; document.getElementById('ipVal').textContent=info.ip||'--'; }catch(e){}
  try{ const raw=await invoke('scan_networks'); const lines=raw.split('\n').slice(1); networks=lines.map(l=>{ const m=l.trim().match(/(.+)\s+([0-9a-f:]{17})\s+(-\d+)\s+(\S+)\s+(\S+)\s+(\S+)/i); if(!m) return null; return {ssid:m[1].trim(), bssid:m[2], rssi:parseInt(m[3]), channel:m[4]}; }).filter(Boolean).filter(n=>n.ssid); render(); }catch(e){console.error(e);}
  if(dot) dot.className='dot ok';
}
function render(){ const q=(document.getElementById('search')?.value||'').toLowerCase(); const list=q?networks.filter(n=>n.ssid.toLowerCase().includes(q)):networks; document.getElementById('count').textContent=list.length; document.getElementById('netList').innerHTML=list.map(n=>`<tr onclick="selectNet('${n.ssid.replace(/'/g,"\'")}')"><td>${n.ssid}</td><td>${n.rssi} dBm</td><td>${n.channel}</td><td><span class="badge">${n.rssi>-60?'Strong':n.rssi>-75?'Medium':'Weak'}</span></td></tr>`).join(''); }
window.selectNet=(ssid)=>{ selected=ssid; document.getElementById('selSsid').textContent=ssid; document.getElementById('joinBtn').disabled=false; };
window.doConnect=async()=>{ const pw=document.getElementById('pw').value; if(!selected) return; const b=document.getElementById('joinBtn'); b.textContent='Joining...'; const r=await invoke('connect_wifi',{ssid:selected,password:pw}); b.textContent='Join'; alert(r); refresh(); };
window.doDisconnect=async()=>{ await invoke('disconnect_wifi'); refresh(); };
document.getElementById('search')?.addEventListener('input',render);
setInterval(refresh,8000); refresh(); window.refresh=refresh;
