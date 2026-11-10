export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function api(path, data) {
  const response = await fetch(path, data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {});
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || result.message || '連線失敗，請再試一次。');
  return result;
}
export function connect(room, role, token, receive, status) {
  let socket, stopped = false, attempt = 0, timer;
  function open() {
    status(false);
    const url = new URL('/ws', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('room',room); url.searchParams.set('role',role); if(token) url.searchParams.set(role==='display'?'accessToken':'token',token);
    socket = new WebSocket(url);
    socket.onopen = () => { attempt=0; status(true); };
    socket.onmessage = e => { try { receive(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    socket.onclose = event => {if(event.code===4001)stopped=true;status(false,event.code); if(!stopped)timer=setTimeout(open,Math.min(5000,700*2**attempt++));};
    socket.onerror = () => socket.close();
  }
  open();
  return {send: data => { if(socket?.readyState !== WebSocket.OPEN) throw new Error('目前未連線，請稍候自動重連。'); socket.send(JSON.stringify(data)); }, close:()=>{stopped=true;clearTimeout(timer);socket?.close();}};
}
export function audio() {
  let ctx,noise,compressor;const voices=new Set();
  return {
    enable:async()=>{
      ctx ||= new AudioContext();await ctx.resume();
      if(!noise){
        noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.12),ctx.sampleRate);
        const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-14;compressor.knee.value=8;compressor.ratio.value=5;compressor.attack.value=.002;compressor.release.value=.12;compressor.connect(ctx.destination);
      }
    },
    tone(freq=440,duration=.12,volume=.08,type='sine') {
      if(!ctx||ctx.state!=='running')return;
      const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+duration);
      o.onended=()=>{o.disconnect();g.disconnect();};
    },
    impact(power=0,pan=0){
      if(!ctx||ctx.state!=='running'||!noise||voices.size>=6)return false;
      const strength=Math.min(1,Math.max(0,Number(power)||0)/10),at=ctx.currentTime,duration=.11+strength*.15;
      const body=ctx.createOscillator(),bodyGain=ctx.createGain(),attack=ctx.createBufferSource(),attackGain=ctx.createGain(),filter=ctx.createBiquadFilter(),output=ctx.createGain();
      const panner=ctx.createStereoPanner?.();if(panner){panner.pan.value=Math.max(-1,Math.min(1,Number(pan)||0));output.connect(panner);panner.connect(compressor);}else output.connect(compressor);
      output.gain.value=.65;
      // A short metal strike above a falling mechanical body, not a repeated bass beep.
      body.type='triangle';body.frequency.setValueAtTime(210+strength*130,at);body.frequency.exponentialRampToValueAtTime(65+strength*35,at+duration);
      bodyGain.gain.setValueAtTime(.001,at);bodyGain.gain.linearRampToValueAtTime(.035+strength*.12,at+.003);bodyGain.gain.exponentialRampToValueAtTime(.001,at+duration);
      body.connect(bodyGain);bodyGain.connect(output);
      attack.buffer=noise;filter.type='bandpass';filter.frequency.value=1800+strength*2200;filter.Q.value=.8;
      attackGain.gain.setValueAtTime(.045+strength*.18,at);attackGain.gain.exponentialRampToValueAtTime(.001,at+.025+strength*.035);
      attack.connect(filter);filter.connect(attackGain);attackGain.connect(output);
      const voice={body,attack};voices.add(voice);
      body.onended=()=>{voices.delete(voice);for(const node of [body,bodyGain,attack,attackGain,filter,output,panner])node?.disconnect();};
      body.start(at);attack.start(at);body.stop(at+duration);attack.stop(at+.09);return true;
    },
    rail(phase,speed=0,pan=0,reason=''){
      // Contact/release cues share the impact limiter, leaving two slots for collisions.
      if(!ctx||ctx.state!=='running'||!noise||voices.size>=4)return false;
      if(phase!=='enter'&&phase!=='exit')return false;
      const release=phase==='exit',strength=Math.min(1,Math.max(0,Number(speed)||0)/14);
      const at=ctx.currentTime,duration=release?.13:.18;
      const zip=ctx.createOscillator(),gain=ctx.createGain(),catchNoise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),click=ctx.createGain(),output=ctx.createGain();
      const panner=ctx.createStereoPanner?.();if(panner){panner.pan.value=Math.max(-1,Math.min(1,Number(pan)||0));output.connect(panner);panner.connect(compressor);}else output.connect(compressor);
      output.gain.value=.45;zip.type='triangle';
      zip.frequency.setValueAtTime(release?620:260,at);zip.frequency.exponentialRampToValueAtTime(release?240:700+strength*350,at+duration);
      gain.gain.setValueAtTime(.001,at);gain.gain.linearRampToValueAtTime(.025+strength*.035,at+.012);gain.gain.exponentialRampToValueAtTime(.001,at+duration);
      zip.connect(gain);gain.connect(output);catchNoise.buffer=noise;filter.type='bandpass';filter.frequency.value=release?2300:1400;filter.Q.value=2;
      click.gain.setValueAtTime(release?.035:.07,at);click.gain.exponentialRampToValueAtTime(.001,at+.035);
      catchNoise.connect(filter);filter.connect(click);click.connect(output);
      const voice={zip,catchNoise};voices.add(voice);
      zip.onended=()=>{voices.delete(voice);for(const node of [zip,gain,catchNoise,filter,click,output,panner])node?.disconnect();};
      zip.start(at);zip.stop(at+duration);catchNoise.start(at);catchNoise.stop(at+.045);return true;
    },
    get enabled(){return ctx?.state==='running';}
  };
}
export const phaseText = {lobby:'等待選手入場',ready:'拉環準備',countdown:'準備發射',shoot:'SHOOT！拉環發射',running:'激戰中',result:'本場結果',finished:'冠軍誕生'};